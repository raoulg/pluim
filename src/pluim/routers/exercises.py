from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pluim.database import get_db
from pluim.deps import get_current_user, require_admin
from pluim.models import Course, Enrollment, Exercise, Feedback, Grade, Submission, User
from pluim.schemas import (
    CourseOverview,
    ExerciseCreate,
    ExerciseOut,
    ExerciseUpdate,
    FeedbackOut,
    GradeOut,
    OverviewCell,
    OverviewRow,
    SubmissionOut,
    CourseOut,
    UserOut,
)

router = APIRouter(prefix="/api/courses", tags=["exercises"])


@router.get("/{course_id}/exercises", response_model=list[ExerciseOut])
async def list_exercises(
    course_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _assert_course_access(course_id, user, db)
    result = await db.execute(
        select(Exercise).where(Exercise.course_id == course_id).order_by(Exercise.order_index, Exercise.created_at)
    )
    return result.scalars().all()


@router.post("/{course_id}/exercises", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    course_id: int,
    data: ExerciseCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Course not found")
    exercise = Exercise(course_id=course_id, created_by_id=user.id, **data.model_dump())
    db.add(exercise)
    await db.commit()
    await db.refresh(exercise)
    return exercise


@router.get("/{course_id}/exercises/{exercise_id}", response_model=ExerciseOut)
async def get_exercise(
    course_id: int,
    exercise_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _assert_course_access(course_id, user, db)
    exercise = await _get_exercise(exercise_id, course_id, db)
    return exercise


@router.put("/{course_id}/exercises/{exercise_id}", response_model=ExerciseOut)
async def update_exercise(
    course_id: int,
    exercise_id: int,
    data: ExerciseUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    exercise = await _get_exercise(exercise_id, course_id, db)
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(exercise, field, val)
    await db.commit()
    await db.refresh(exercise)
    return exercise


@router.delete("/{course_id}/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(
    course_id: int,
    exercise_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    exercise = await _get_exercise(exercise_id, course_id, db)
    await db.delete(exercise)
    await db.commit()


@router.get("/{course_id}/overview", response_model=CourseOverview)
async def course_overview(
    course_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    students_result = await db.execute(
        select(User)
        .join(Enrollment, Enrollment.user_id == User.id)
        .where(Enrollment.course_id == course_id)
        .order_by(User.github_username)
    )
    students = students_result.scalars().all()

    exercises_result = await db.execute(
        select(Exercise)
        .where(Exercise.course_id == course_id)
        .order_by(Exercise.order_index, Exercise.created_at)
    )
    exercises = exercises_result.scalars().all()

    student_ids = [s.id for s in students]
    exercise_ids = [e.id for e in exercises]

    # latest submission per (user, exercise)
    submissions_result = await db.execute(
        select(Submission).where(
            Submission.user_id.in_(student_ids),
            Submission.exercise_id.in_(exercise_ids),
        )
    )
    all_submissions = submissions_result.scalars().all()
    latest_sub: dict[tuple, Submission] = {}
    for sub in all_submissions:
        key = (sub.user_id, sub.exercise_id)
        if key not in latest_sub or sub.submitted_at > latest_sub[key].submitted_at:
            latest_sub[key] = sub

    grades_result = await db.execute(
        select(Grade).where(
            Grade.user_id.in_(student_ids),
            Grade.exercise_id.in_(exercise_ids),
        )
    )
    all_grades_objs = grades_result.scalars().all()

    # load graded_by for each grade
    grader_ids = list({g.graded_by_id for g in all_grades_objs})
    if grader_ids:
        graders_result = await db.execute(select(User).where(User.id.in_(grader_ids)))
        graders = {u.id: u for u in graders_result.scalars().all()}
    else:
        graders = {}

    grade_map: dict[tuple, Grade] = {}
    for g in all_grades_objs:
        g.graded_by = graders.get(g.graded_by_id)
        grade_map[(g.user_id, g.exercise_id)] = g

    # load feedbacks for all grades
    grade_ids = [g.id for g in all_grades_objs]
    if grade_ids:
        feedbacks_result = await db.execute(
            select(Feedback).where(Feedback.grade_id.in_(grade_ids)).order_by(Feedback.created_at)
        )
        all_feedbacks = feedbacks_result.scalars().all()
        fb_author_ids = list({f.author_id for f in all_feedbacks})
        if fb_author_ids:
            fb_authors_result = await db.execute(select(User).where(User.id.in_(fb_author_ids)))
            fb_authors = {u.id: u for u in fb_authors_result.scalars().all()}
            for f in all_feedbacks:
                f.author = fb_authors.get(f.author_id)
        feedbacks_by_grade: dict[int, list] = {}
        for f in all_feedbacks:
            feedbacks_by_grade.setdefault(f.grade_id, []).append(f)
    else:
        feedbacks_by_grade = {}

    rows = []
    for student in students:
        cells = {}
        for exercise in exercises:
            key = (student.id, exercise.id)
            sub = latest_sub.get(key)
            grade = grade_map.get(key)
            if grade:
                grade_out = GradeOut(
                    id=grade.id,
                    user_id=grade.user_id,
                    exercise_id=grade.exercise_id,
                    value=grade.value,
                    comment=grade.comment,
                    graded_by=UserOut.model_validate(grade.graded_by),
                    viewed_at=grade.viewed_at,
                    created_at=grade.created_at,
                    updated_at=grade.updated_at,
                    feedbacks=[
                        FeedbackOut.model_validate(f)
                        for f in feedbacks_by_grade.get(grade.id, [])
                    ],
                )
            else:
                grade_out = None
            cells[exercise.id] = OverviewCell(
                submission=SubmissionOut.model_validate(sub) if sub else None,
                grade=grade_out,
            )
        rows.append(OverviewRow(student=UserOut.model_validate(student), cells=cells))

    return CourseOverview(
        course=CourseOut.model_validate(course),
        exercises=[ExerciseOut.model_validate(e) for e in exercises],
        rows=rows,
    )


async def _assert_course_access(course_id: int, user: User, db: AsyncSession) -> None:
    if user.is_admin:
        return
    result = await db.execute(
        select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not enrolled in this course")


async def _get_exercise(exercise_id: int, course_id: int, db: AsyncSession) -> Exercise:
    result = await db.execute(
        select(Exercise).where(Exercise.id == exercise_id, Exercise.course_id == course_id)
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise
