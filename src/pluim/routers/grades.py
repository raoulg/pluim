from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pluim.database import get_db
from pluim.deps import get_current_user, require_admin
from pluim.models import Exercise, Grade, User
from pluim.schemas import GradeCreate, GradeOut

router = APIRouter(prefix="/api", tags=["grades"])


@router.get("/exercises/{exercise_id}/grades/me", response_model=GradeOut | None)
async def get_my_grade(
    exercise_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Grade).where(Grade.user_id == user.id, Grade.exercise_id == exercise_id)
    )
    grade = result.scalar_one_or_none()
    if not grade:
        return None
    await db.refresh(grade, ["graded_by"])
    return grade


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
        select(Exercise).where(Exercise.id == exercise_id, Exercise.course_id == course_id)
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    _validate_grade_value(data.value, exercise)

    result = await db.execute(
        select(Grade).where(Grade.user_id == student_id, Grade.exercise_id == exercise_id)
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
    await db.refresh(grade, ["graded_by"])
    return grade


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
        select(Grade).where(Grade.user_id == student_id, Grade.exercise_id == exercise_id)
    )
    grade = result.scalar_one_or_none()
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    await db.delete(grade)
    await db.commit()


@router.post("/exercises/{exercise_id}/grades/me/mark-viewed", status_code=status.HTTP_204_NO_CONTENT)
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
        select(func.count(Grade.id)).where(Grade.user_id == user.id, Grade.viewed_at.is_(None))
    )
    return {"count": result.scalar_one()}


def _validate_grade_value(value: str, exercise: Exercise) -> None:
    if exercise.grade_type == "pass_fail":
        if value not in ("pass", "fail"):
            raise HTTPException(status_code=400, detail="Value must be 'pass' or 'fail'")
    elif exercise.grade_type == "numeric":
        try:
            num = float(value)
        except ValueError:
            raise HTTPException(status_code=400, detail="Grade value must be a number")
        if exercise.grade_min is not None and num < exercise.grade_min:
            raise HTTPException(status_code=400, detail=f"Grade must be at least {exercise.grade_min}")
        if exercise.grade_max is not None and num > exercise.grade_max:
            raise HTTPException(status_code=400, detail=f"Grade must be at most {exercise.grade_max}")
