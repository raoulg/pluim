import json
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, field_validator
from pydantic.functional_serializers import PlainSerializer

UTCDatetime = Annotated[
    datetime,
    PlainSerializer(lambda v: v.isoformat() + "Z", return_type=str, when_used="json"),
]


# ── User ──────────────────────────────────────────────────────────────────────


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    github_id: int
    github_username: str
    github_avatar_url: str
    github_email: str | None
    is_admin: bool
    created_at: UTCDatetime


class UserUpdate(BaseModel):
    is_admin: bool


# ── Course ────────────────────────────────────────────────────────────────────


class CourseCreate(BaseModel):
    name: str
    description: str | None = None


class CourseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_archived: bool | None = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None
    enrollment_code: str
    is_archived: bool
    created_at: UTCDatetime


# ── Exercise ──────────────────────────────────────────────────────────────────


class ExerciseCreate(BaseModel):
    title: str
    description: str = ""
    start_date: datetime | None = None
    due_date: datetime | None = None
    allowed_extensions: str = "pdf"
    allow_late_upload: bool = True
    grade_type: str = "numeric"
    grade_min: float | None = 0.0
    grade_max: float | None = 10.0
    rubric_description: str | None = None
    rubric_template: str | None = None
    order_index: int = 0
    upload_requirement: str = "optional"  # mandatory | optional | none
    url_requirement: str = "optional"  # mandatory | optional | none


class ExerciseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    allowed_extensions: str | None = None
    allow_late_upload: bool | None = None
    grade_type: str | None = None
    grade_min: float | None = None
    grade_max: float | None = None
    rubric_description: str | None = None
    rubric_template: str | None = None
    order_index: int | None = None
    upload_requirement: str | None = None
    url_requirement: str | None = None


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_id: int
    title: str
    description: str
    start_date: UTCDatetime | None
    due_date: UTCDatetime | None
    allowed_extensions: str
    allow_late_upload: bool
    grade_type: str
    grade_min: float | None
    grade_max: float | None
    rubric_description: str | None
    rubric_template: str | None
    order_index: int
    upload_requirement: str
    url_requirement: str
    created_at: UTCDatetime
    updated_at: UTCDatetime


# ── Submission ────────────────────────────────────────────────────────────────


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    exercise_id: int
    submission_type: str
    original_filename: str | None
    url: str | None
    submitted_at: UTCDatetime
    is_late: bool


class SubmissionWithUser(SubmissionOut):
    user: UserOut


class MySubmissionsOut(BaseModel):
    file: SubmissionOut | None
    url: SubmissionOut | None


# ── Finalization ──────────────────────────────────────────────────────────────


class FinalizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    exercise_id: int
    finalized_at: UTCDatetime


# ── Grade ─────────────────────────────────────────────────────────────────────


class GradeCreate(BaseModel):
    value: str
    comment: str | None = None


class RubricCriterionScore(BaseModel):
    score: float = 0.0
    is_knockout: bool = False
    remark: str = ""


class RubricScoresIn(BaseModel):
    scores: dict[str, RubricCriterionScore]
    bonuses: dict[str, float] = {}
    publish: bool = False


class FeedbackCreate(BaseModel):
    content: str


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    grade_id: int
    author: UserOut
    content: str
    created_at: UTCDatetime


class GradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    exercise_id: int
    value: str
    comment: str | None
    graded_by: UserOut
    viewed_at: UTCDatetime | None
    is_published: bool
    created_at: UTCDatetime
    updated_at: UTCDatetime
    feedbacks: list[FeedbackOut] = []
    rubric_scores: dict | None = None

    @field_validator("rubric_scores", mode="before")
    @classmethod
    def _parse_rubric_scores(cls, v: str | dict | None) -> dict | None:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return None
        return v


# ── Overview (professor dashboard) ───────────────────────────────────────────


class OverviewCell(BaseModel):
    file: SubmissionOut | None
    url: SubmissionOut | None
    grade: GradeOut | None


class OverviewRow(BaseModel):
    student: UserOut
    cells: dict[int, OverviewCell]  # exercise_id -> cell


class CourseOverview(BaseModel):
    course: CourseOut
    exercises: list[ExerciseOut]
    rows: list[OverviewRow]


# ── Enrollment ────────────────────────────────────────────────────────────────


class EnrollRequest(BaseModel):
    enrollment_code: str


class EnrollByUsernameRequest(BaseModel):
    github_username: str


# ── Auth ──────────────────────────────────────────────────────────────────────


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TodoItem(BaseModel):
    student_id: int
    student_username: str
    student_avatar: str
    exercise_id: int
    exercise_title: str
    course_id: int
    course_name: str
    finalized_at: UTCDatetime
    has_draft: bool
