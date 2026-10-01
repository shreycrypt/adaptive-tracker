"""Initialize the SQLite schema and seed the default user profile."""

import asyncio

from database import dispose_db, init_db


async def main() -> None:
    await init_db()
    await dispose_db()
    print("Database initialized; default user profile 1 is ready.")


if __name__ == "__main__":
    asyncio.run(main())
