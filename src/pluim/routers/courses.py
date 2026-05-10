from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from pluim.database import get_db
from pluim.deps import get_current_user, require_admin
from pluim.models import Course, Enrollment, User
from pluim.schemas import CourseCreate, CourseOut, CourseUpdate, EnrollByUsernameRequest, EnrollRequest, UserOut

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("", response_model=list[CourseOut])
async def list_courses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.is_admin:
        result = await db.execute(select(Course).order_by(Course.created_at.desc()))
        return result.scalars().all()
    result = await db.execute(
        select(Course)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Enrollment.user_id == user.id)
        .order_by(Course.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def create_course(
    data: CourseCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    course = Course(name=data.name, description=data.description, created_by_id=user.id)
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course


@router.get("/{course_id}", response_model=CourseOut)
async def get_course(
    course_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_accessible_course(course_id, user, db)
    return course


@router.put("/{course_id}", response_model=CourseOut)
async def update_course(
    course_id: int,
    data: CourseUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(course, field, val)
    await db.commit()
    await db.refresh(course)
    return course


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    await db.delete(course)
    await db.commit()


@router.post("/{course_id}/enroll", response_model=CourseOut)
async def enroll(
    course_id: int,
    data: EnrollRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course or course.is_archived:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.enrollment_code != data.enrollment_code:
        raise HTTPException(status_code=400, detail="Invalid enrollment code")
    existing = await db.execute(
        select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course_id)
    )
    if not existing.scalar_one_or_none():
        db.add(Enrollment(user_id=user.id, course_id=course_id))
        await db.commit()
    return course


@router.post("/join", response_model=CourseOut)
async def join_by_code(
    data: EnrollRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Course).where(Course.enrollment_code == data.enrollment_code, Course.is_archived == False)
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Invalid enrollment code")
    existing = await db.execute(
        select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course.id)
    )
    if not existing.scalar_one_or_none():
        db.add(Enrollment(user_id=user.id, course_id=course.id))
        await db.commit()
        await db.refresh(course)
    return course


@router.get("/{course_id}/students", response_model=list[UserOut])
async def list_students(
    course_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .join(Enrollment, Enrollment.user_id == User.id)
        .where(Enrollment.course_id == course_id)
        .order_by(User.github_username)
    )
    return result.scalars().all()


@router.post("/{course_id}/students", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def add_student(
    course_id: int,
    data: EnrollByUsernameRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    result = await db.execute(select(User).where(User.github_username == data.github_username))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="User not found — they must log in first")
    existing = await db.execute(
        select(Enrollment).where(Enrollment.user_id == student.id, Enrollment.course_id == course_id)
    )
    if not existing.scalar_one_or_none():
        db.add(Enrollment(user_id=student.id, course_id=course_id))
        await db.commit()
    return student


@router.delete("/{course_id}/students/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_student(
    course_id: int,
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Enrollment).where(Enrollment.user_id == user_id, Enrollment.course_id == course_id)
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    await db.delete(enrollment)
    await db.commit()


@router.post("/{course_id}/regenerate-code", response_model=CourseOut)
async def regenerate_code(
    course_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    import secrets
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    course.enrollment_code = secrets.token_urlsafe(6)
    await db.commit()
    await db.refresh(course)
    return course


async def _get_accessible_course(course_id: int, user: User, db: AsyncSession) -> Course:
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if user.is_admin:
        return course
    enrollment = await db.execute(
        select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course_id)
    )
    if not enrollment.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not enrolled in this course")
    return course
