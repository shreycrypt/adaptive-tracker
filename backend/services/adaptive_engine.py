"""Metabolic adaptation calculations backed by persisted daily logs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from math import isfinite
from typing import Any, Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import DailyLog, EntryType, UserProfile

KCAL_PER_KG = 7_700.0
MAX_WEEKLY_TARGET_SHIFT_KCAL = 150.0
MIN_WEIGHT_DAYS = 5


@dataclass(frozen=True)
class DailyMetrics:
    """Aggregated metrics for one calendar day."""

    date: date
    weight_kg: float | None
    calorie_intake: float
    active_calories_burned: float
    logged_items: list[dict[str, Any]]


@dataclass(frozen=True)
class AdaptiveCalculation:
    """Complete, auditable output of one adaptive-calculation cycle."""

    user_id: int
    as_of_date: date
    current_week_start: date
    current_week_end: date
    previous_week_start: date
    previous_week_end: date
    weight_days_logged: int
    minimum_weight_days_required: int
    current_weight_average: float | None
    previous_weight_average: float | None
    weekly_weight_velocity: float | None
    average_daily_calorie_intake: float
    average_daily_active_calories_burned: float
    tdee_estimate: float | None
    target_velocity: float | None
    previous_calorie_target: float | None
    proposed_calorie_target: float | None
    calorie_target_shift: float
    previous_active_calorie_target: float | None
    proposed_active_calorie_target: float | None
    adjustment_applied: bool
    reason: str

    def as_dict(self) -> dict[str, Any]:
        """Return JSON-serializable audit data."""
        return {
            "user_id": self.user_id,
            "as_of_date": self.as_of_date.isoformat(),
            "current_week": {
                "start": self.current_week_start.isoformat(),
                "end": self.current_week_end.isoformat(),
            },
            "previous_week": {
                "start": self.previous_week_start.isoformat(),
                "end": self.previous_week_end.isoformat(),
            },
            "weight_days_logged": self.weight_days_logged,
            "minimum_weight_days_required": self.minimum_weight_days_required,
            "current_weight_average": self.current_weight_average,
            "previous_weight_average": self.previous_weight_average,
            "weekly_weight_velocity": self.weekly_weight_velocity,
            "average_daily_calorie_intake": self.average_daily_calorie_intake,
            "average_daily_active_calories_burned": self.average_daily_active_calories_burned,
            "tdee_estimate": self.tdee_estimate,
            "target_velocity": self.target_velocity,
            "previous_calorie_target": self.previous_calorie_target,
            "proposed_calorie_target": self.proposed_calorie_target,
            "calorie_target_shift": self.calorie_target_shift,
            "previous_active_calorie_target": self.previous_active_calorie_target,
            "proposed_active_calorie_target": self.proposed_active_calorie_target,
            "adjustment_applied": self.adjustment_applied,
            "reason": self.reason,
        }


def _window_entries(entries: Sequence[DailyLog], end_date: date, window_days: int = 7) -> list[DailyLog]:
    start_date = end_date - timedelta(days=window_days - 1)
    return [entry for entry in entries if start_date <= entry.date <= end_date]


def calculate_rolling_average_weight(
    entries: Sequence[DailyLog],
    end_date: date,
    window_days: int = 7,
) -> float | None:
    """Calculate the arithmetic mean of available weights in a trailing window."""
    weights = [
        float(entry.metric_weight)
        for entry in _window_entries(entries, end_date, window_days)
        if entry.metric_weight is not None and isfinite(float(entry.metric_weight))
    ]
    return sum(weights) / len(weights) if weights else None


def calculate_weekly_weight_velocity(
    entries: Sequence[DailyLog],
    as_of_date: date,
) -> float | None:
    """Calculate MA(this week) minus MA(last week), in kg per week."""
    this_week_average = calculate_rolling_average_weight(entries, as_of_date, 7)
    last_week_average = calculate_rolling_average_weight(
        entries, as_of_date - timedelta(days=7), 7
    )
    if this_week_average is None or last_week_average is None:
        return None
    return this_week_average - last_week_average


def _number(value: Any) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return 0.0
    return result if isfinite(result) and result >= 0 else 0.0


def _nutrition_calories(structured_json: dict[str, Any]) -> float:
    items = structured_json.get("items")
    if isinstance(items, list):
        return sum(_number(item.get("estimated_calories")) for item in items if isinstance(item, dict))
    return _number(structured_json.get("estimated_calories"))


def _active_calories(structured_json: dict[str, Any]) -> float:
    for key in ("active_calories_burned", "calories_burned", "active_calories"):
        if key in structured_json:
            return _number(structured_json[key])
    items = structured_json.get("items")
    if isinstance(items, list):
        return sum(
            _number(item.get("active_calories_burned", item.get("calories_burned")))
            for item in items
            if isinstance(item, dict)
        )
    return 0.0


def aggregate_daily_metrics(logs: Iterable[DailyLog]) -> list[DailyMetrics]:
    """Aggregate stored entries into one dashboard row per daily log."""
    rows: list[DailyMetrics] = []
    for log in sorted(logs, key=lambda item: item.date):
        intake = 0.0
        active = 0.0
        items: list[dict[str, Any]] = []
        for entry in log.entries:
            payload = entry.structured_json if isinstance(entry.structured_json, dict) else {}
            if entry.entry_type == EntryType.NUTRITION:
                intake += _nutrition_calories(payload)
            elif entry.entry_type == EntryType.ATHLETIC:
                active += _active_calories(payload)
            items.append(
                {
                    "id": entry.id,
                    "entry_type": entry.entry_type.value,
                    "raw_text": entry.raw_text,
                    "structured_json": payload,
                    "created_at": entry.created_at.isoformat() if entry.created_at else None,
                }
            )
        rows.append(
            DailyMetrics(log.date, log.metric_weight, intake, active, items)
        )
    return rows


def estimate_tdee(
    average_daily_calorie_intake: float,
    weekly_weight_velocity: float,
    average_daily_active_calories_burned: float,
) -> float:
    """Estimate TDEE using intake, observed velocity, and active calories."""
    return (
        average_daily_calorie_intake
        - (weekly_weight_velocity * KCAL_PER_KG / 7.0)
        + average_daily_active_calories_burned
    )


def calculate_target_calories(
    tdee_estimate: float,
    target_velocity: float,
    previous_target: float | None,
    max_weekly_shift: float = MAX_WEEKLY_TARGET_SHIFT_KCAL,
) -> tuple[float, float]:
    """Calculate desired intake and apply the +/- weekly target guardrail."""
    desired = tdee_estimate + (target_velocity * KCAL_PER_KG / 7.0)
    if previous_target is None:
        return round(max(desired, 0.0), 1), round(desired, 1)
    bounded = min(max(desired, previous_target - max_weekly_shift), previous_target + max_weekly_shift)
    return round(max(bounded, 0.0), 1), round(bounded - previous_target, 1)


async def calculate_adaptive_cycle(
    session: AsyncSession,
    user_id: int,
    as_of_date: date | None = None,
) -> AdaptiveCalculation:
    """Load a user's last 14 days and calculate an auditable adaptation cycle."""
    as_of = as_of_date or date.today()
    current_start = as_of - timedelta(days=6)
    previous_start = as_of - timedelta(days=13)
    previous_end = as_of - timedelta(days=7)

    profile = await session.get(UserProfile, user_id)
    if profile is None:
        raise ValueError(f"User profile {user_id} was not found")

    result = await session.execute(
        select(DailyLog)
        .where(
            DailyLog.user_id == user_id,
            DailyLog.date >= previous_start,
            DailyLog.date <= as_of,
        )
        .options(selectinload(DailyLog.entries))
        .order_by(DailyLog.date)
    )
    logs = list(result.scalars().unique().all())
    current_logs = [log for log in logs if current_start <= log.date <= as_of]
    current_metrics = aggregate_daily_metrics(current_logs)
    intake_average = sum(row.calorie_intake for row in current_metrics) / 7.0
    active_average = sum(row.active_calories_burned for row in current_metrics) / 7.0
    weight_days = sum(row.weight_kg is not None for row in current_metrics)
    current_average = calculate_rolling_average_weight(logs, as_of, 7)
    previous_average = calculate_rolling_average_weight(logs, previous_end, 7)
    velocity = calculate_weekly_weight_velocity(logs, as_of)
    previous_calories = profile.current_target_calories
    previous_active = getattr(profile, "current_target_active_calories", None)

    if weight_days < MIN_WEIGHT_DAYS:
        return AdaptiveCalculation(
            user_id, as_of, current_start, as_of, previous_start, previous_end,
            weight_days, MIN_WEIGHT_DAYS, current_average, previous_average, velocity,
            round(intake_average, 1), round(active_average, 1), None,
            profile.target_velocity, previous_calories, previous_calories, 0.0,
            previous_active, previous_active, False,
            f"Adjustment skipped: {weight_days}/{MIN_WEIGHT_DAYS} weight days logged.",
        )

    if velocity is None:
        return AdaptiveCalculation(
            user_id, as_of, current_start, as_of, previous_start, previous_end,
            weight_days, MIN_WEIGHT_DAYS, current_average, previous_average, velocity,
            round(intake_average, 1), round(active_average, 1), None,
            profile.target_velocity, previous_calories, previous_calories, 0.0,
            previous_active, previous_active, False,
            "Adjustment skipped: two complete rolling weight averages are required.",
        )

    tdee = estimate_tdee(intake_average, velocity, active_average)
    target_velocity = float(profile.target_velocity or 0.0)
    new_calories, shift = calculate_target_calories(tdee, target_velocity, previous_calories)
    new_active = round(active_average, 1) if active_average > 0 else previous_active
    return AdaptiveCalculation(
        user_id, as_of, current_start, as_of, previous_start, previous_end,
        weight_days, MIN_WEIGHT_DAYS, current_average, previous_average, velocity,
        round(intake_average, 1), round(active_average, 1), round(tdee, 1),
        profile.target_velocity, previous_calories, new_calories, shift,
        previous_active, new_active, True,
        "Adjustment applied using observed weekly velocity and TDEE estimate.",
    )
