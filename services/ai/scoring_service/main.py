"""
scoring-service: deterministic DQS from metadata. Never calls an LLM.
"""

from typing import Literal, Optional
from fastapi import HTTPException, Query
from common.health import create_app
from common.logger import logger
from common.schemas import DQSReport, ExtractedMetadata, LLMScoredResponse
from scoring_service.engine import ENGINE_VERSION, WEIGHT_PROFILES, score
from scoring_service.legacy_rules import compute_rule_based_scores

app = create_app(
    "scoring-service",
    ENGINE_VERSION,
    "Deterministic, evidence-carrying Data Quality Score engine (no LLM).",
)


@app.post("/score", response_model=DQSReport)
async def score_metadata(
    metadata: ExtractedMetadata,
    profile: Optional[Literal["payments", "generic"]] = Query(default=None, description="Weight profile override"),
):
    logger.info(f"Scoring dataset {metadata.dataset.dataset_name} ({metadata.dataset.row_count} rows)")
    return score(metadata, profile)


@app.get("/weights")
async def weights():
    return WEIGHT_PROFILES


@app.post("/score/legacy-rules", response_model=LLMScoredResponse)
async def legacy_rule_scores(metadata: ExtractedMetadata):
    """
    The original rule-only baseline (max unique-ratio uniqueness, negative-ratio
    validity, ...) kept unchanged so earlier evaluation results stay reproducible.
    """
    try:
        return compute_rule_based_scores(metadata)
    except Exception as e:
        logger.error(f"Legacy rule scoring failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="legacy rule scoring failed")
