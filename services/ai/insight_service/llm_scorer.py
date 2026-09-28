"""
Ablation baseline: the LLM computes dimension scores itself from metadata.
Not used by the product pipeline; exposed so the evaluation can compare
LLM-as-scorer against the deterministic engine on identical metadata.
"""

import json
import time
from common import llm
from common.governance import redact
from common.schemas import ExtractedMetadata, LLMScoredResponse
from insight_service.prompts import LLM_SCORER_PROMPT

RULE_FIELDS = ("id", "source", "dimension", "type", "column", "description", "checked", "violations", "violation_ratio")


def scorer_view(metadata: ExtractedMetadata) -> dict:
    """Everything the engine scores from, minus rule parameters (e.g. full ISO code lists)
    that carry no scoring information but would blow hosted per-minute token quotas."""
    md = metadata.model_dump(mode="json", exclude={"governance": True, "patterns": True})
    for c in md.get("columns", []):
        c.pop("sample_values_masked", None)
        c.pop("shape_signatures", None)
    for stats in (md.get("categorical_stats") or {}).values():
        stats.pop("values", None)
    ev = md.get("rule_evaluation")
    if ev:
        ev["rules"] = [{k: r.get(k) for k in RULE_FIELDS} for r in ev.get("rules", [])]
        ev["rejected"] = len(ev.get("rejected", []))
        ev.pop("derivation", None)
    return md


async def llm_score(metadata: ExtractedMetadata) -> dict:
    payload, redactions = redact(scorer_view(metadata))
    started = time.perf_counter()
    result = await llm.structured_invoke(
        LLM_SCORER_PROMPT.format(metadata=json.dumps(payload, separators=(",", ":"))), LLMScoredResponse, max_tokens=3000
    )
    return {
        **result.model_dump(),
        "model": llm.model_id(),
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
        "redactions": redactions,
    }
