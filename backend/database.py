"""Async database configuration and FastAPI session dependency."""

from collections.abc import AsyncGenerator
import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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


def normalize_database_url(url: str) -> tuple[str, dict[str, object]]:
    """Convert Render/libpq URLs into a SQLAlchemy async driver URL.

    Render appends ``sslmode=require``. asyncpg rejects that keyword, so it is
    rewritten to ``ssl=True`` in connect_args.
    """
    connect_args: dict[str, object] = {}
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        return url, connect_args

    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    sslmode = query.pop("sslmode", None)
    ssl_value = query.pop("ssl", None)
    needs_ssl = sslmode in {"require", "verify-ca", "verify-full", "prefer"} or (
        ssl_value in {"true", "1", "require"}
    )
    if needs_ssl:
        connect_args["ssl"] = True
    url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    return url, connect_args


DATABASE_URL, ENGINE_CONNECT_ARGS = normalize_database_url(
    os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR / 'app.db'}")
)
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args=ENGINE_CONNECT_ARGS,
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
        if IS_SQLITE:
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
