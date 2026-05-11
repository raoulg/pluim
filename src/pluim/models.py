import secrets
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pluim.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    github_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    github_username: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )
    github_avatar_url: Mapped[str] = mapped_column(
        String(512), nullable=False, default=""
    )
    github_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    enrollments: Mapped[list["Enrollment"]] = relationship(
        "Enrollment", back_populates="user"
    )
    submissions: Mapped[list["Submission"]] = relationship(
        "Submission", back_populates="user"
    )
    grades: Mapped[list["Grade"]] = relationship(
        "Grade", foreign_keys="Grade.user_id", back_populates="user"
    )


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    enrollment_code: Mapped[str] = mapped_column(
        String(16),
        unique=True,
        nullable=False,
        default=lambda: secrets.token_urlsafe(6),
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )

    enrollments: Mapped[list["Enrollment"]] = relationship(
        "Enrollment", back_populates="course", cascade="all, delete-orphan"
    )
    exercises: Mapped[list["Exercise"]] = relationship(
        "Exercise",
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="Exercise.order_index",
    )


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("user_id", "course_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id"), nullable=False
    )
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="enrollments")
    course: Mapped["Course"] = relationship("Course", back_populates="enrollments")


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    start_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    allowed_extensions: Mapped[str] = mapped_column(
        String(255), nullable=False, default="pdf"
    )
    allow_late_upload: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    grade_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="numeric"
    )  # numeric | pass_fail
    grade_min: Mapped[float | None] = mapped_column(Float, nullable=True, default=0.0)
    grade_max: Mapped[float | None] = mapped_column(Float, nullable=True, default=10.0)
    rubric_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rubric_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # mandatory | optional | none
    upload_requirement: Mapped[str] = mapped_column(
        String(20), nullable=False, default="optional"
    )
    url_requirement: Mapped[str] = mapped_column(
        String(20), nullable=False, default="optional"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )

    course: Mapped["Course"] = relationship("Course", back_populates="exercises")
    submissions: Mapped[list["Submission"]] = relationship(
        "Submission", back_populates="exercise", cascade="all, delete-orphan"
    )
    grades: Mapped[list["Grade"]] = relationship(
        "Grade", back_populates="exercise", cascade="all, delete-orphan"
    )
    finalizations: Mapped[list["Finalization"]] = relationship(
        "Finalization", back_populates="exercise", cascade="all, delete-orphan"
    )


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    exercise_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exercises.id"), nullable=False
    )
    submission_type: Mapped[str] = mapped_column(
        String(10), nullable=False
    )  # file | url
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    is_late: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="submissions")
    exercise: Mapped["Exercise"] = relationship(
        "Exercise", back_populates="submissions"
    )


class Grade(Base):
    __tablename__ = "grades"
    __table_args__ = (UniqueConstraint("user_id", "exercise_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    exercise_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exercises.id"), nullable=False
    )
    value: Mapped[str] = mapped_column(String(50), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    graded_by_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rubric_scores: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(
        "User", foreign_keys=[user_id], back_populates="grades"
    )
    exercise: Mapped["Exercise"] = relationship("Exercise", back_populates="grades")
    graded_by: Mapped["User"] = relationship("User", foreign_keys=[graded_by_id])
    feedbacks: Mapped[list["Feedback"]] = relationship(
        "Feedback",
        back_populates="grade",
        cascade="all, delete-orphan",
        order_by="Feedback.created_at",
    )


class Feedback(Base):
    __tablename__ = "feedbacks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    grade_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("grades.id"), nullable=False
    )
    author_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    grade: Mapped["Grade"] = relationship("Grade", back_populates="feedbacks")
    author: Mapped["User"] = relationship("User")


class Finalization(Base):
    __tablename__ = "finalizations"
    __table_args__ = (UniqueConstraint("user_id", "exercise_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    exercise_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exercises.id"), nullable=False
    )
    finalized_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User")
    exercise: Mapped["Exercise"] = relationship(
        "Exercise", back_populates="finalizations"
    )
