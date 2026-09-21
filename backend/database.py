"""Async SQLite database configuration and FastAPI session dependency."""

from collections.abc import AsyncGenerator
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR / 'app.db'}")

engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session and always close it afterward."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create all database tables if they do not already exist."""
    # Import models before metadata creation so all tables are registered.
    import models  # noqa: F401

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        # SQLite's create_all does not alter an already-existing table. Keep
        # this small additive migration here so existing installations can
        # adopt the adaptive activity target without a separate migration tool.
        columns = await connection.execute(text("PRAGMA table_info(user_profiles)"))
        existing_columns = {row[1] for row in columns.fetchall()}
        if "current_target_active_calories" not in existing_columns:
            await connection.execute(
                text(
                    "ALTER TABLE user_profiles "
                    "ADD COLUMN current_target_active_calories FLOAT"
                )
            )

    # Seed the first profile so a fresh installation can be used immediately.
    # The check makes startup idempotent and never overwrites user changes.
    from models import UserProfile, UnitPreference

    async with AsyncSessionLocal() as session:
        default_profile = await session.get(UserProfile, 1)
        if default_profile is None:
            session.add(
                UserProfile(
                    id=1,
                    target_velocity=-0.5,
                    current_target_calories=2200.0,
                    current_target_active_calories=350.0,
                    unit_preference=UnitPreference.METRIC,
                )
            )
            await session.commit()


async def dispose_db() -> None:
    """Dispose pooled database connections during application shutdown."""
    await engine.dispose()
