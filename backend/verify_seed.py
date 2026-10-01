"""Verify that the default user profile exists with expected targets."""

import asyncio

from database import AsyncSessionLocal, dispose_db
from models import UserProfile


async def main() -> None:
    async with AsyncSessionLocal() as session:
        profile = await session.get(UserProfile, 1)
        assert profile is not None, "Default profile 1 was not created"
        assert profile.current_target_calories == 2200.0
        print(
            f"user_id={profile.id} "
            f"target_calories={profile.current_target_calories} "
            f"active_target={profile.current_target_active_calories}"
        )
    await dispose_db()


if __name__ == "__main__":
    asyncio.run(main())
