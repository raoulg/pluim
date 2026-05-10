import os
from datetime import datetime, timezone
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pluim.config import settings
from pluim.database import get_db
from pluim.deps import get_current_user, require_admin
from pluim.models import Enrollment, Exercise, Finalization, Submission, User
from pluim.schemas import FinalizationOut, MySubmissionsOut, SubmissionOut

router = APIRouter(prefix="/api/exercises", tags=["submissions"])

MAX_BYTES = settings.max_upload_size_mb * 1024 * 1024


@router.get("/{exercise_id}/my-submission", response_model=SubmissionOut | None)
async def get_my_submission(
    exercise_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Submission)
        .where(Submission.user_id == user.id, Submission.exercise_id == exercise_id)
        .order_by(Submission.submitted_at.desc())
    )
    return result.scalars().first()


@router.get("/{exercise_id}/my-submissions", response_model=MySubmissionsOut)
async def get_my_submissions(
    exercise_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_result = await db.execute(
        select(Submission)
        .where(Submission.user_id == user.id, Submission.exercise_id == exercise_id, Submission.submission_type == "file")
        .order_by(Submission.submitted_at.desc())
    )
    url_result = await db.execute(
        select(Submission)
        .where(Submission.user_id == user.id, Submission.exercise_id == exercise_id, Submission.submission_type == "url")
        .order_by(Submission.submitted_at.desc())
    )
    return MySubmissionsOut(file=file_result.scalars().first(), url=url_result.scalars().first())


@router.get("/{exercise_id}/my-finalization", response_model=FinalizationOut | None)
async def get_my_finalization(
    exercise_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Finalization).where(Finalization.user_id == user.id, Finalization.exercise_id == exercise_id)
    )
    return result.scalar_one_or_none()


@router.post("/{exercise_id}/finalize", response_model=FinalizationOut)
async def finalize_submission(
    exercise_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exercise = await _get_accessible_exercise(exercise_id, user, db)

    if exercise.upload_requirement == "mandatory":
        file_result = await db.execute(
            select(Submission).where(
                Submission.user_id == user.id,
                Submission.exercise_id == exercise_id,
                Submission.submission_type == "file",
            )
        )
        if not file_result.scalars().first():
            raise HTTPException(status_code=400, detail="File upload is required before handing in")

    if exercise.url_requirement == "mandatory":
        url_result = await db.execute(
            select(Submission).where(
                Submission.user_id == user.id,
                Submission.exercise_id == exercise_id,
                Submission.submission_type == "url",
            )
        )
        if not url_result.scalars().first():
            raise HTTPException(status_code=400, detail="URL submission is required before handing in")

    result = await db.execute(
        select(Finalization).where(Finalization.user_id == user.id, Finalization.exercise_id == exercise_id)
    )
    fin = result.scalar_one_or_none()
    if fin:
        fin.finalized_at = datetime.now(timezone.utc)
    else:
        fin = Finalization(user_id=user.id, exercise_id=exercise_id)
        db.add(fin)
    await db.commit()
    await db.refresh(fin)
    return fin


@router.get("/{exercise_id}/submissions", response_model=list[SubmissionOut])
async def list_submissions(
    exercise_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Submission)
        .where(Submission.exercise_id == exercise_id)
        .order_by(Submission.submitted_at.desc())
    )
    return result.scalars().all()


@router.post("/{exercise_id}/submit-url", response_model=SubmissionOut)
async def submit_url(
    exercise_id: int,
    url: str = Form(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exercise = await _get_accessible_exercise(exercise_id, user, db)
    _check_submission_allowed(exercise)

    is_late = _is_late(exercise)
    sub = Submission(
        user_id=user.id,
        exercise_id=exercise_id,
        submission_type="url",
        url=url,
        is_late=is_late,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.post("/{exercise_id}/submit-file", response_model=SubmissionOut)
async def submit_file(
    exercise_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exercise = await _get_accessible_exercise(exercise_id, user, db)
    _check_submission_allowed(exercise)

    filename = file.filename or "upload"
    ext = Path(filename).suffix.lstrip(".").lower()
    allowed = [e.strip().lower() for e in exercise.allowed_extensions.split(",") if e.strip()]
    if allowed and ext not in allowed:
        raise HTTPException(status_code=400, detail=f"File type .{ext} not allowed. Allowed: {', '.join(allowed)}")

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_size_mb}MB limit")

    dest_dir = Path(settings.upload_dir) / str(exercise_id) / str(user.id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{int(datetime.now(timezone.utc).timestamp())}_{filename}"
    dest = dest_dir / safe_name

    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    is_late = _is_late(exercise)
    sub = Submission(
        user_id=user.id,
        exercise_id=exercise_id,
        submission_type="file",
        file_path=str(dest.relative_to(settings.upload_dir)),
        original_filename=filename,
        is_late=is_late,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.get("/{exercise_id}/submissions/{submission_id}/download")
async def download_submission(
    exercise_id: int,
    submission_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id, Submission.exercise_id == exercise_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if not user.is_admin and sub.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if sub.submission_type != "file" or not sub.file_path:
        raise HTTPException(status_code=400, detail="No file attached")

    full_path = Path(settings.upload_dir) / sub.file_path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(str(full_path), filename=sub.original_filename or "download")


async def _get_accessible_exercise(exercise_id: int, user: User, db: AsyncSession) -> Exercise:
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if not user.is_admin:
        enrollment = await db.execute(
            select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == exercise.course_id)
        )
        if not enrollment.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not enrolled in this course")
    return exercise


def _check_submission_allowed(exercise: Exercise) -> None:
    now = datetime.now(timezone.utc)
    if exercise.start_date and exercise.start_date.replace(tzinfo=timezone.utc) > now:
        raise HTTPException(status_code=400, detail="Exercise not yet available")
    if exercise.due_date and not exercise.allow_late_upload:
        due = exercise.due_date.replace(tzinfo=timezone.utc)
        if now > due:
            raise HTTPException(status_code=400, detail="Due date has passed and late submissions are not allowed")


def _is_late(exercise: Exercise) -> bool:
    if not exercise.due_date:
        return False
    now = datetime.now(timezone.utc)
    due = exercise.due_date.replace(tzinfo=timezone.utc)
    return now > due
