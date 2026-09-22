"""Metric and parsed-entry API routes."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import DailyLog, EntryLog, EntryType, UserProfile
from schemas import (
    DashboardDay,
    DashboardResponse,
    EntryLogRequest,
    EntryLogResponse,
    WeightLogRequest,
    WeightLogResponse,
)
from services.adaptive_engine import (
    aggregate_daily_metrics,
    calculate_rolling_average_weight,
    calculate_weekly_weight_velocity,
)

router = APIRouter(prefix="/api/v1/logs", tags=["logs"])


async def _get_daily_log(
    session: AsyncSession, user_id: int, log_date: date
) -> DailyLog | None:
    result = await session.execute(
        select(DailyLog)
        .where(DailyLog.user_id == user_id, DailyLog.date == log_date)
        .options(selectinload(DailyLog.entries))
    )
    return result.scalars().first()


async def _ensure_today_log(session: AsyncSession, user_id: int) -> DailyLog:
    """Create a zeroed current-day row exactly once per user and calendar date."""
    today = date.today()
    daily_log = await _get_daily_log(session, user_id, today)
    if daily_log is None:
        daily_log = DailyLog(user_id=user_id, date=today, metric_weight=None)
        session.add(daily_log)
        await session.commit()
        await session.refresh(daily_log)
    return daily_log


@router.post("/weight", response_model=WeightLogResponse, status_code=status.HTTP_200_OK)
async def log_weight(
    request: WeightLogRequest,
    session: AsyncSession = Depends(get_db),
) -> DailyLog:
    """Log a weight, updating the existing row for the same user and date."""
    if await session.get(UserProfile, request.user_id) is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    daily_log = await _get_daily_log(session, request.user_id, request.date)
    if daily_log is None:
        daily_log = DailyLog(
            user_id=request.user_id,
            date=request.date,
            metric_weight=request.metric_weight,
        )
        session.add(daily_log)
    else:
        daily_log.metric_weight = request.metric_weight
    await session.commit()
    await session.refresh(daily_log)
    return daily_log


@router.post("/entry", response_model=EntryLogResponse, status_code=status.HTTP_201_CREATED)
async def save_entry(
    request: EntryLogRequest,
    session: AsyncSession = Depends(get_db),
) -> EntryLog:
    """Persist a parser result against an existing daily log."""
    daily_log = await session.get(DailyLog, request.daily_log_id)
    if daily_log is None:
        raise HTTPException(status_code=404, detail="Daily log not found")
    entry = EntryLog(
        daily_log_id=request.daily_log_id,
        entry_type=EntryType(request.entry_type),
        raw_text=request.raw_text,
        structured_json=request.structured_json,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


@router.get("/dashboard/{user_id}", response_model=DashboardResponse)
async def get_dashboard(
    user_id: int,
    session: AsyncSession = Depends(get_db),
) -> DashboardResponse:
    """Return current trailing-seven-day trends and all logged items."""
    if await session.get(UserProfile, user_id) is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    await _ensure_today_log(session, user_id)
    end_date = date.today()
    start_date = end_date - timedelta(days=6)
    result = await session.execute(
        select(DailyLog)
        .where(
            DailyLog.user_id == user_id,
            DailyLog.date >= start_date,
            DailyLog.date <= end_date,
        )
        .options(selectinload(DailyLog.entries))
        .order_by(DailyLog.date)
    )
    logs = list(result.scalars().unique().all())
    metrics_by_date = {row.date: row for row in aggregate_daily_metrics(logs)}
    days = [
        DashboardDay(
            date=day,
            metric_weight=metrics_by_date[day].weight_kg if day in metrics_by_date else None,
            calorie_intake=metrics_by_date[day].calorie_intake if day in metrics_by_date else 0.0,
            active_calories_burned=metrics_by_date[day].active_calories_burned if day in metrics_by_date else 0.0,
            logged_items=metrics_by_date[day].logged_items if day in metrics_by_date else [],
        )
        for day in (start_date + timedelta(days=offset) for offset in range(7))
    ]
    return DashboardResponse(
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        weight_days_logged=sum(day.metric_weight is not None for day in days),
        rolling_average_weight=calculate_rolling_average_weight(logs, end_date),
        weekly_weight_velocity=calculate_weekly_weight_velocity(logs, end_date),
        total_calorie_intake=round(sum(day.calorie_intake for day in days), 1),
        total_active_calories_burned=round(sum(day.active_calories_burned for day in days), 1),
        days=days,
    )
