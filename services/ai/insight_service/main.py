"""
insight-service: LLM explanations, recommendations, chat and report export.
Scores are never changed here; the LLM-as-scorer endpoint exists only as an
evaluation baseline.
"""

from fastapi import HTTPException
from common import llm
from common.health import create_app
from common.schemas import DQSReport, ExtractedMetadata
from insight_service.chat import router as chat_router
from insight_service.grounding import report_texts, verify
from insight_service.llm_scorer import llm_score
from insight_service.narrative import explain
from insight_service.report import to_markdown

app = create_app("insight-service", "2.0.0", "Grounded GenAI explanations and recommendations for DQS reports.")
app.include_router(chat_router)


@app.post("/insights", response_model=DQSReport)
async def insights(report: DQSReport):
    """Adds an LLM narrative to an engine report; falls back to the engine's text if the LLM is
    unavailable or its narrative fails the numeric grounding check."""
    return await explain(report)


@app.post("/grounding")
async def grounding(report: DQSReport):
    """Grounding check over all free text in a report (used by tests and the evaluation)."""
    return verify(report_texts(report), report)


@app.post("/export-report")
async def export_report(report: DQSReport):
    return {"markdown": to_markdown(report)}


@app.post("/experimental/llm-score")
async def experimental_llm_score(metadata: ExtractedMetadata):
    try:
        return await llm_score(metadata)
    except llm.LLMUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"LLM unavailable: {exc}")
    except llm.LLMOutputError as exc:
        raise HTTPException(status_code=502, detail=str(exc)[:500])
