"""Adaptive metabolic-target API routes."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import UserProfile
from schemas import AdaptiveAuditResponse, UserProfileRead
from services.adaptive_engine import calculate_adaptive_cycle

router = APIRouter(prefix="/api/v1/adaptive", tags=["adaptive"])


@router.post("/recalculate/{user_id}", response_model=AdaptiveAuditResponse)
async def recalculate_adaptive_targets(
    user_id: int,
    session: AsyncSession = Depends(get_db),
) -> AdaptiveAuditResponse:
    """Run the guarded adaptive algorithm and persist changed targets."""
    profile = await session.get(UserProfile, user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    try:
        calculation = await calculate_adaptive_cycle(session, user_id, date.today())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if calculation.adjustment_applied:
        profile.current_target_calories = calculation.proposed_calorie_target
        profile.current_target_active_calories = calculation.proposed_active_calorie_target
        await session.commit()
        await session.refresh(profile)

    return AdaptiveAuditResponse(
        audit=calculation.as_dict(),
        updated_profile=UserProfileRead.model_validate(profile),
    )
