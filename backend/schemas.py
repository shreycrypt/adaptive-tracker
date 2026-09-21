"""Pydantic v2 schemas for API validation and AI parsing."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class NutritionParsed(BaseModel):
    """A normalized nutrition item extracted from natural language."""

    name: str = Field(min_length=1, description="Food or drink name")
    quantity: float = Field(gt=0, description="Amount consumed")
    unit: str = Field(min_length=1, description="Unit for quantity, such as g, ml, or piece")
    estimated_calories: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)


class ExerciseParsed(BaseModel):
    """A normalized exercise item extracted from natural language."""

    exercise_name: str = Field(min_length=1)
    sets: int | None = Field(default=None, ge=1)
    reps: int | None = Field(default=None, ge=1)
    weight_kg: float | None = Field(default=None, ge=0)


ParsedItem = Annotated[NutritionParsed | ExerciseParsed, Field(discriminator=None)]


class CombinedParseResult(BaseModel):
    """The parser's category and normalized items."""

    category: Literal["NUTRITION", "ATHLETIC"]
    items: list[NutritionParsed | ExerciseParsed] = Field(default_factory=list)
    raw_summary: str = Field(min_length=1)


class ParseLogRequest(BaseModel):
    """Request body accepted by the parse-log endpoint."""

    raw_text: str = Field(min_length=1, max_length=10_000)
    category_hint: Literal["NUTRITION", "ATHLETIC"] | None = None

    @field_validator("raw_text")
    @classmethod
    def strip_raw_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("raw_text must contain non-whitespace characters")
        return cleaned


class UserProfileCreate(BaseModel):
    target_velocity: float | None = None
    current_target_calories: float | None = Field(default=None, ge=0)
    current_target_active_calories: float | None = Field(default=None, ge=0)
    unit_preference: Literal["METRIC", "IMPERIAL"] = "METRIC"


class UserProfileRead(UserProfileCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int


class DailyLogCreate(BaseModel):
    user_id: int = Field(gt=0)
    date: date
    metric_weight: float | None = Field(default=None, ge=0)


class DailyLogRead(DailyLogCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class EntryLogCreate(BaseModel):
    daily_log_id: int = Field(gt=0)
    entry_type: Literal["NUTRITION", "ATHLETIC"]
    raw_text: str = Field(min_length=1, max_length=10_000)
    structured_json: dict


class EntryLogRead(EntryLogCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class WeightLogRequest(BaseModel):
    """Create or update a user's weight for a calendar date."""

    user_id: int = Field(gt=0)
    date: date
    metric_weight: float = Field(gt=0, description="Weight in kilograms")


class WeightLogResponse(BaseModel):
    """Persisted weight-log response."""

    id: int
    user_id: int
    date: date
    metric_weight: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EntryLogRequest(BaseModel):
    """Create a parsed nutrition or athletic entry on a daily log."""

    daily_log_id: int = Field(gt=0)
    entry_type: Literal["NUTRITION", "ATHLETIC"]
    raw_text: str = Field(min_length=1, max_length=10_000)
    structured_json: dict

    @field_validator("raw_text")
    @classmethod
    def strip_entry_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("raw_text must contain non-whitespace characters")
        return cleaned


class EntryLogResponse(BaseModel):
    """Persisted entry-log response."""

    id: int
    daily_log_id: int
    entry_type: Literal["NUTRITION", "ATHLETIC"]
    raw_text: str
    structured_json: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DashboardDay(BaseModel):
    """One day of trend and logged-item dashboard data."""

    date: date
    metric_weight: float | None
    calorie_intake: float
    active_calories_burned: float
    logged_items: list[dict]


class DashboardResponse(BaseModel):
    """Current seven-day dashboard response."""

    user_id: int
    start_date: date
    end_date: date
    weight_days_logged: int
    rolling_average_weight: float | None
    weekly_weight_velocity: float | None
    total_calorie_intake: float
    total_active_calories_burned: float
    days: list[DashboardDay]


class AdaptiveAuditResponse(BaseModel):
    """Audit trail returned after an adaptive recalculation."""

    audit: dict
    updated_profile: UserProfileRead
