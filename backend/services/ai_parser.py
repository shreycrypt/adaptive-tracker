"""LLM-backed parsing service for free-form nutrition and exercise logs."""

from __future__ import annotations

import logging
import os
import re
from typing import Literal
from urllib.parse import quote_plus

from schemas import CombinedParseResult, NutritionParsed

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


def _explicit_nutrition_result(raw_text: str) -> CombinedParseResult | None:
    """Parse exact nutrition values when the user includes them in the log."""
    kcal = re.search(r"(\d+(?:\.\d+)?)\s*(?:kcal|calories?)", raw_text, re.I)
    protein = re.search(r"(?:p|protein)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g", raw_text, re.I)
    carbs = re.search(r"(?:c|carbs?|carbohydrates?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g", raw_text, re.I)
    fat = re.search(r"(?:f|fat)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g", raw_text, re.I)
    if not kcal:
        return None
    return CombinedParseResult(category="NUTRITION", items=[NutritionParsed(
        name=re.split(r"[,;(]", raw_text, maxsplit=1)[0].strip(), quantity=1, unit="serving",
        estimated_calories=float(kcal.group(1)), protein_g=float(protein.group(1)) if protein else None,
        carbs_g=float(carbs.group(1)) if carbs else None, fat_g=float(fat.group(1)) if fat else None,
    )], raw_summary=raw_text)


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
    explicit = _explicit_nutrition_result(raw_text) if category == "NUTRITION" else None
    if explicit:
        return explicit
    return CombinedParseResult(category=category, items=[], raw_summary=raw_text)
    return CombinedParseResult(category=category, items=[], raw_summary=raw_text)


async def _lookup_open_food_facts(raw_text: str) -> CombinedParseResult | None:
    """Look up packaged/menu products when no configured AI parser is available."""
    try:
        import httpx
        url = "https://world.openfoodfacts.org/cgi/search.pl?search_terms=" + quote_plus(raw_text) + "&search_simple=1&action=process&json=1&page_size=1"
        async with httpx.AsyncClient(timeout=6) as client:
            response = await client.get(url, headers={"User-Agent": "AdaptiveTracker/1.0"})
            response.raise_for_status()
            product = (response.json().get("products") or [None])[0]
        if not product:
            return None
        nutriments = product.get("nutriments") or {}
        calories = nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal_value")
        if calories is None:
            return None
        name = product.get("product_name") or raw_text.strip()
        return CombinedParseResult(category="NUTRITION", items=[NutritionParsed(
            name=name, quantity=100, unit="g",
            estimated_calories=float(calories),
            protein_g=float(nutriments["proteins_100g"]) if nutriments.get("proteins_100g") is not None else None,
            carbs_g=float(nutriments["carbohydrates_100g"]) if nutriments.get("carbohydrates_100g") is not None else None,
            fat_g=float(nutriments["fat_100g"]) if nutriments.get("fat_100g") is not None else None,
        )], raw_summary=f"{name} · values per 100g")
    except Exception as exc:
        logger.info("Open Food Facts lookup unavailable: %s", exc)
        return None


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
            logger.warning("OPENAI_API_KEY is not configured; using public nutrition lookup")
            return await _lookup_open_food_facts(raw_text) or _fallback_result(raw_text, category_hint)

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
        return await _lookup_open_food_facts(raw_text) or _fallback_result(raw_text, category_hint)
