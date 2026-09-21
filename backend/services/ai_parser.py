"""LLM-backed parsing service for free-form nutrition and exercise logs."""

from __future__ import annotations

import logging
import os
from typing import Literal

from schemas import CombinedParseResult

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")

_SYSTEM_PROMPT = """
You parse mobile health-tracking log text into structured data.
Choose exactly one category: NUTRITION for food/drink intake, or ATHLETIC for
exercise/training. Return only the requested Pydantic structure.
For NUTRITION items use name, quantity, unit, and estimated nutrient values;
for ATHLETIC items use exercise_name, sets, reps, and weight_kg.
Never invent quantities or nutrient/training details that are not stated: use
null for unknown optional values. Preserve the meaning of the input in
raw_summary. If multiple things are mentioned, return one item per thing.
""".strip()


def _fallback_result(
    raw_text: str,
    category_hint: Literal["NUTRITION", "ATHLETIC"] | None = None,
) -> CombinedParseResult:
    """Return a safe, valid result when the external parser is unavailable."""
    nutrition_words = {
        "ate",
        "breakfast",
        "calorie",
        "calories",
        "dinner",
        "drank",
        "food",
        "lunch",
        "meal",
        "protein",
        "snack",
        "water",
    }
    tokens = {token.strip(".,!?;:").lower() for token in raw_text.split()}
    category = category_hint or (
        "NUTRITION" if tokens.intersection(nutrition_words) else "ATHLETIC"
    )
    return CombinedParseResult(
        category=category,
        items=[],
        raw_summary=raw_text,
    )


async def parse_log(
    raw_text: str,
    category_hint: Literal["NUTRITION", "ATHLETIC"] | None = None,
) -> CombinedParseResult:
    """Parse a natural-language log using Instructor and an OpenAI-compatible API.

    The service intentionally initializes its client lazily. This keeps imports
    and application startup usable in environments that have not configured an
    API key, while returning a typed fallback instead of failing the endpoint.
    """
    try:
        import instructor
        from openai import AsyncOpenAI

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY is not configured; using parser fallback")
            return _fallback_result(raw_text, category_hint)

        client = instructor.from_openai(
            AsyncOpenAI(
                api_key=api_key,
                base_url=os.getenv("OPENAI_API_BASE"),
            )
        )
        hint = f" The requested category hint is {category_hint}." if category_hint else ""
        return await client.chat.completions.create(
            model=DEFAULT_MODEL,
            response_model=CombinedParseResult,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": f"Parse this log:{hint}\n\n{raw_text}"},
            ],
            temperature=0,
        )
    except Exception as exc:  # External SDK, network, or model failures are recoverable.
        logger.exception("AI log parsing failed; using typed fallback: %s", exc)
        return _fallback_result(raw_text, category_hint)
