"""
LLM narrative layer: plain-language explanations and recommendations for an
engine report. The LLM sees a compact, redacted view of the report, never
metadata values or rows, and its output is merged only after a numeric
grounding check; a narrative that fails the check is discarded in favour of
the engine's deterministic text.
"""

import json
import os
import time
from typing import List

from pydantic import AliasChoices, BaseModel, Field

from common import llm
from common.governance import redact
from common.logger import logger
from common.schemas import DQSReport
from insight_service.grounding import verify
from insight_service.prompts import NARRATIVE_PROMPT

GROUNDING_MIN_SCORE = float(os.getenv("GROUNDING_MIN_SCORE", "0.8"))
MAX_FINDINGS_IN_PROMPT = 15


class DimensionNarrative(BaseModel):
    dimension: str
    narrative: str


class FindingAdvice(BaseModel):
    finding_id: str = Field(validation_alias=AliasChoices("finding_id", "id"))
    action: str
    rationale: str


class NarrativeOutput(BaseModel):
    executive_summary: str
    dimension_narratives: List[DimensionNarrative]
    recommendations: List[FindingAdvice]
    compliance_insights: List[str] = Field(description="Empty list when no regulatory context applies")


def prompt_view(report: DQSReport) -> dict:
    """The only part of a report the narrative LLM sees."""
    return {
        "dataset": {k: report.dataset.get(k) for k in ("dataset_name", "row_count", "column_count", "detected_domain", "source_type")},
        "composite_dqs": report.composite_dqs,
        "grade": report.grade,
        "weight_profile": report.scoring_profile,
        "jurisdiction": (report.rules or {}).get("jurisdiction"),
        "dimensions": [
            {
                "dimension": d.dimension,
                "scored": d.applicable,
                "score": d.score,
                "weight": d.weight,
                "formula": d.formula,
                "explanation": d.explanation,
            }
            for d in report.dimensions
        ],
        "findings": [
            {
                "id": f.id,
                "dimension": f.dimension,
                "column": f.columns[0],
                "rule": f.description,
                "violations": f.violations,
                "checked": f.checked,
                "violation_percent": round(f.violation_ratio * 100, 1),
                "severity": f.severity,
                "regulatory_context": f.regulatory_context,
            }
            for f in report.findings[:MAX_FINDINGS_IN_PROMPT]
        ],
        "prohibited_data": [r for r in report.regulatory_compliance_risks if r.startswith("Column '")],
    }


def merge(report: DQSReport, out: NarrativeOutput) -> DQSReport:
    enriched = report.model_copy(deep=True)
    enriched.executive_summary = out.executive_summary.strip()

    narratives = {n.dimension.strip().lower(): n.narrative.strip() for n in out.dimension_narratives}
    for d in enriched.dimensions:
        if d.applicable and d.dimension.lower() in narratives:
            d.narrative = narratives[d.dimension.lower()]

    advice = {a.finding_id.strip(): a for a in out.recommendations}
    for action in enriched.remediation_actions:
        a = advice.get(action.finding_ids[0]) if action.finding_ids else None
        if a:
            action.action = a.action.strip()
            action.description = a.rationale.strip()

    enriched.regulatory_compliance_risks = list(
        dict.fromkeys(report.regulatory_compliance_risks + [c.strip() for c in out.compliance_insights if c.strip()])
    )
    unknown = sorted(set(advice) - {f.id for f in report.findings})
    enriched.governance = {**enriched.governance, "llm_unknown_finding_ids": unknown}
    return enriched


def _llm_texts(out: NarrativeOutput) -> List[str]:
    return (
        [out.executive_summary]
        + [n.narrative for n in out.dimension_narratives]
        + [a.action + " " + a.rationale for a in out.recommendations]
        + out.compliance_insights
    )


async def explain(report: DQSReport) -> DQSReport:
    view, redactions = redact(prompt_view(report))
    governance = {
        **report.governance,
        "llm_provider": llm.model_id(),
        "llm_local": llm.is_local(),
        "llm_input": "engine report summary (scores, rule descriptions, counts); no data values",
        "llm_input_redactions": redactions,
    }
    started = time.perf_counter()
    try:
        out = await llm.structured_invoke(
            NARRATIVE_PROMPT.format(report=json.dumps(view, separators=(",", ":"))), NarrativeOutput, max_tokens=5000
        )
    except (llm.LLMUnavailable, llm.LLMOutputError) as exc:
        logger.warning(f"Narrative unavailable, keeping template text: {exc}")
        return report.model_copy(update={"governance": {**governance, "narrative_error": str(exc)[:300]}})

    grounding = verify(_llm_texts(out), report)
    governance["narrative_latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
    if grounding.score is not None and grounding.score < GROUNDING_MIN_SCORE:
        logger.warning(f"Narrative rejected: grounding {grounding.score:.2f} < {GROUNDING_MIN_SCORE}")
        return report.model_copy(update={
            "grounding": grounding,
            "governance": {**governance, "narrative_rejected": f"grounding {grounding.score:.2f} below {GROUNDING_MIN_SCORE}"},
        })

    enriched = merge(report, out)
    enriched.narrative_source = "llm"
    enriched.narrative_model = llm.model_id()
    enriched.grounding = grounding
    enriched.governance = {**governance, **{k: v for k, v in enriched.governance.items() if k.startswith("llm_unknown")}}
    return enriched
