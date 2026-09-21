"""SQLAlchemy models for the mobile data-tracking application."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from database import Base


class EntryType(str, Enum):
    """Supported categories of user log entries."""

    NUTRITION = "NUTRITION"
    ATHLETIC = "ATHLETIC"


class UnitPreference(str, Enum):
    """Unit systems supported by the profile model."""

    METRIC = "METRIC"
    IMPERIAL = "IMPERIAL"


class UserProfile(Base):
    """User-level targets and display preferences."""

    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    target_velocity: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_target_calories: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_target_active_calories: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit_preference: Mapped[UnitPreference] = mapped_column(
        SqlEnum(UnitPreference, name="unit_preference"),
        default=UnitPreference.METRIC,
        nullable=False,
    )

    daily_logs: Mapped[list[DailyLog]] = relationship(
        back_populates="user_profile",
        cascade="all, delete-orphan",
    )


class DailyLog(Base):
    """A user's daily weight and associated entries."""

    __tablename__ = "daily_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    metric_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user_profile: Mapped[UserProfile] = relationship(back_populates="daily_logs")
    entries: Mapped[list[EntryLog]] = relationship(
        back_populates="daily_log",
        cascade="all, delete-orphan",
    )


class EntryLog(Base):
    """A raw user entry and its structured AI interpretation."""

    __tablename__ = "entry_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    daily_log_id: Mapped[int] = mapped_column(
        ForeignKey("daily_logs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entry_type: Mapped[EntryType] = mapped_column(
        SqlEnum(EntryType, name="entry_type"), nullable=False
    )
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    structured_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    daily_log: Mapped[DailyLog] = relationship(back_populates="entries")
