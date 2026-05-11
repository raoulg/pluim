import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pluim.database import get_db
from pluim.deps import get_current_user, require_admin
from pluim.models import Exercise, Feedback, Grade, User
from pluim.schemas import (
    FeedbackCreate,
    FeedbackOut,
    GradeCreate,
    GradeOut,
    RubricCriterionScore,
    RubricScoresIn,
    UserOut,
)

router = APIRouter(prefix="/api", tags=["grades"])


async def _load_grade_relations(grade: Grade, db: AsyncSession) -> list[Feedback]:
    await db.refresh(grade, ["graded_by"])
    feedbacks_result = await db.execute(
        select(Feedback)
        .where(Feedback.grade_id == grade.id)
        .order_by(Feedback.created_at)
    )
    feedbacks = feedbacks_result.scalars().all()
    author_ids = list({f.author_id for f in feedbacks})
    if author_ids:
        authors_result = await db.execute(select(User).where(User.id.in_(author_ids)))
        authors = {u.id: u for u in authors_result.scalars().all()}
        for f in feedbacks:
            f.author = authors[f.author_id]
    return list(feedbacks)


def _calculate_rubric_grade(
    template: dict, scores: dict[str, RubricCriterionScore]
) -> float:
    criteria = template["criteria"]
    verslag_weight = template.get("verslag_weight", 0.7)
    code_weight = template.get("code_weight", 0.3)

    if any(scores[c["id"]].is_knockout for c in criteria if c["id"] in scores):
        return 1.0

    verslag = [c for c in criteria if c["section"] == "verslag"]
    code = [c for c in criteria if c["section"] == "code"]
    v_total = sum(c["weight"] for c in verslag)
    c_total = sum(c["weight"] for c in code)

    v_sum = sum(scores[c["id"]].score * c["weight"] for c in verslag if c["id"] in scores)
    c_sum = sum(scores[c["id"]].score * c["weight"] for c in code if c["id"] in scores)

    v_score = (v_sum / v_total * 10) if v_total > 0 else 0.0
    c_score = (c_sum / c_total * 10) if c_total > 0 else 0.0

    return round(verslag_weight * v_score + code_weight * c_score, 1)


def _make_grade_out(grade: Grade, feedbacks: list[Feedback]) -> GradeOut:
    return GradeOut(
        id=grade.id,
        user_id=grade.user_id,
        exercise_id=grade.exercise_id,
        value=grade.value,
        comment=grade.comment,
        graded_by=UserOut.model_validate(grade.graded_by),
        viewed_at=grade.viewed_at,
        is_published=grade.is_published,
        created_at=grade.created_at,
        updated_at=grade.updated_at,
        feedbacks=[FeedbackOut.model_validate(f) for f in feedbacks],
        rubric_scores=json.loads(grade.rubric_scores) if grade.rubric_scores else None,
    )


@router.get("/exercises/{exercise_id}/grades/me", response_model=GradeOut | None)
async def get_my_grade(
    exercise_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Grade).where(
            Grade.user_id == user.id,
            Grade.exercise_id == exercise_id,
            Grade.is_published.is_(True),
        )
    )
    grade = result.scalar_one_or_none()
    if not grade:
        return None
    feedbacks = await _load_grade_relations(grade, db)
    return _make_grade_out(grade, feedbacks)


@router.put(
    "/courses/{course_id}/students/{student_id}/exercises/{exercise_id}/grade",
    response_model=GradeOut,
)
async def set_grade(
    course_id: int,
    student_id: int,
    exercise_id: int,
    data: GradeCreate,
    grader: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Exercise).where(
            Exercise.id == exercise_id, Exercise.course_id == course_id
        )
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    _validate_grade_value(data.value, exercise)

    result = await db.execute(
        select(Grade).where(
            Grade.user_id == student_id, Grade.exercise_id == exercise_id
        )
    )
    grade = result.scalar_one_or_none()

    if grade:
        grade.value = data.value
        grade.comment = data.comment
        grade.graded_by_id = grader.id
        grade.viewed_at = None  # reset so student sees notification
    else:
        grade = Grade(
            user_id=student_id,
            exercise_id=exercise_id,
            value=data.value,
            comment=data.comment,
            graded_by_id=grader.id,
        )
        db.add(grade)

    await db.commit()
    await db.refresh(grade)
    feedbacks = await _load_grade_relations(grade, db)
    return _make_grade_out(grade, feedbacks)


@router.delete(
    "/courses/{course_id}/students/{student_id}/exercises/{exercise_id}/grade",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_grade(
    course_id: int,
    student_id: int,
    exercise_id: int,
    grader: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Grade).where(
            Grade.user_id == student_id, Grade.exercise_id == exercise_id
        )
    )
    grade = result.scalar_one_or_none()
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    await db.delete(grade)
    await db.commit()


@router.put(
    "/courses/{course_id}/students/{student_id}/exercises/{exercise_id}/rubric-scores",
    response_model=GradeOut,
)
async def save_rubric_scores(
    course_id: int,
    student_id: int,
    exercise_id: int,
    data: RubricScoresIn,
    grader: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> GradeOut:
    result = await db.execute(
        select(Exercise).where(
            Exercise.id == exercise_id, Exercise.course_id == course_id
        )
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if not exercise.rubric_template:
        raise HTTPException(status_code=400, detail="Exercise has no rubric template")

    template = json.loads(exercise.rubric_template)
    final_grade = _calculate_rubric_grade(template, data.scores)
    scores_json = json.dumps({k: v.model_dump() for k, v in data.scores.items()})

    result = await db.execute(
        select(Grade).where(
            Grade.user_id == student_id, Grade.exercise_id == exercise_id
        )
    )
    grade = result.scalar_one_or_none()

    if grade:
        was_published = grade.is_published
        grade.value = str(final_grade)
        grade.rubric_scores = scores_json
        grade.graded_by_id = grader.id
        grade.is_published = data.publish
        if data.publish:
            grade.viewed_at = None  # notify student on publish / re-publish
        elif was_published:
            grade.viewed_at = None  # unpublishing resets view so re-publish re-notifies
    else:
        grade = Grade(
            user_id=student_id,
            exercise_id=exercise_id,
            value=str(final_grade),
            rubric_scores=scores_json,
            graded_by_id=grader.id,
            is_published=data.publish,
        )
        db.add(grade)

    await db.commit()
    await db.refresh(grade)
    feedbacks = await _load_grade_relations(grade, db)
    return _make_grade_out(grade, feedbacks)


@router.post(
    "/exercises/{exercise_id}/grades/me/mark-viewed",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def mark_grade_viewed(
    exercise_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Grade).where(Grade.user_id == user.id, Grade.exercise_id == exercise_id)
    )
    grade = result.scalar_one_or_none()
    if grade and grade.viewed_at is None:
        grade.viewed_at = datetime.now(timezone.utc)
        await db.commit()


@router.get("/grades/me/unviewed-count")
async def get_unviewed_grade_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(func.count(Grade.id)).where(
            Grade.user_id == user.id,
            Grade.viewed_at.is_(None),
            Grade.is_published.is_(True),
        )
    )
    return {"count": result.scalar_one()}


@router.post(
    "/courses/{course_id}/students/{student_id}/exercises/{exercise_id}/feedback",
    response_model=FeedbackOut,
)
async def add_teacher_feedback(
    course_id: int,
    student_id: int,
    exercise_id: int,
    data: FeedbackCreate,
    author: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Grade).where(
            Grade.user_id == student_id, Grade.exercise_id == exercise_id
        )
    )
    grade = result.scalar_one_or_none()
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")

    feedback = Feedback(grade_id=grade.id, author_id=author.id, content=data.content)
    db.add(feedback)
    grade.viewed_at = None  # reset so student sees notification
    await db.commit()
    await db.refresh(feedback)
    feedback.author = author
    return feedback


@router.post(
    "/exercises/{exercise_id}/grades/me/feedback",
    response_model=FeedbackOut,
)
async def add_student_feedback(
    exercise_id: int,
    data: FeedbackCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Grade).where(Grade.user_id == user.id, Grade.exercise_id == exercise_id)
    )
    grade = result.scalar_one_or_none()
    if not grade:
        raise HTTPException(status_code=404, detail="No grade found for this exercise")

    feedback = Feedback(grade_id=grade.id, author_id=user.id, content=data.content)
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)
    feedback.author = user
    return feedback


def _validate_grade_value(value: str, exercise: Exercise) -> None:
    if exercise.grade_type == "pass_fail":
        if value not in ("pass", "fail"):
            raise HTTPException(
                status_code=400, detail="Value must be 'pass' or 'fail'"
            )
    elif exercise.grade_type == "numeric":
        try:
            num = float(value)
        except ValueError:
            raise HTTPException(status_code=400, detail="Grade value must be a number")
        if exercise.grade_min is not None and num < exercise.grade_min:
            raise HTTPException(
                status_code=400, detail=f"Grade must be at least {exercise.grade_min}"
            )
        if exercise.grade_max is not None and num > exercise.grade_max:
            raise HTTPException(
                status_code=400, detail=f"Grade must be at most {exercise.grade_max}"
            )
