"""FastAPI application entrypoint for the data-tracking backend."""

from contextlib import asynccontextmanager
import os
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import dispose_db, init_db
from routers.adaptive import router as adaptive_router
from routers.logs import router as logs_router
from schemas import CombinedParseResult, ParseLogRequest
from services.ai_parser import parse_log


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Initialize database resources on startup and release them on shutdown."""
    await init_db()
    yield
    await dispose_db()


app = FastAPI(
    title="Mobile Data Tracker API",
    version="1.0.0",
    description="Foundational async API for nutrition and athletic log parsing.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("FRONTEND_ORIGIN", "*").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(logs_router)
app.include_router(adaptive_router)


@app.get("/healthcheck", tags=["system"])
async def healthcheck() -> dict[str, str]:
    """Return a lightweight liveness response."""
    return {"status": "ok"}


@app.post("/api/v1/parse-log", response_model=CombinedParseResult, tags=["parser"])
async def parse_log_endpoint(request: ParseLogRequest) -> CombinedParseResult:
    """Convert a free-form nutrition or exercise log into structured data."""
    return await parse_log(request.raw_text, request.category_hint)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
