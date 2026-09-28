"""
Deterministic, LLM-free data-quality scorer.

Computes the same seven dimension scores the GenAI chain produces, but purely
from the metadata ratios already extracted by the Node ingestion layer — no
LLM call. This exists for two reasons:

1. A cheap fallback / fast path when explainability isn't needed.
2. A rule-only baseline to compare against the GenAI-augmented scores
   (kept as the "legacy rules" baseline) — both paths run against the exact same
   metadata contract, so the comparison isn't confounded by different inputs.

Formulas (weights sum to 1.0, chosen to weight completeness/validity highest
for payment data where missing or out-of-range monetary values carry the most
operational risk):

    Completeness (w=0.20) = 1 - mean(null_ratio) across columns
    Validity     (w=0.20) = 1 - mean(negative_value_ratio) across numeric columns
    Consistency  (w=0.15) = mean(dominant_case_ratio * dominant_length_ratio)
                            across columns with format_stats
    Timeliness   (w=0.15) = 1 - mean(clip(future_timestamp_ratio + stale_record_ratio, 0, 1))
                            across temporal columns
    Uniqueness   (w=0.15) = max(unique_ratio) across columns
                            (proxy for the least-duplicated candidate key)
    Accuracy     (w=0.10) = same signal as Validity (no independent range-check
                            metadata is available in the deterministic path;
                            documented limitation — see paper Discussion)
    Integrity    (w=0.05) = same signal as Uniqueness (no dependent-null /
                            cross-column metadata is populated yet; documented
                            limitation — see paper Discussion)

All dimensions default to 1.0 (perfect) when a dataset has no columns of the
relevant kind, matching the "no evidence of a problem" convention used by the
GenAI prompt.
"""

from common.schemas import ExtractedMetadata

WEIGHTS = {
    "Completeness": 0.20,
    "Validity": 0.20,
    "Consistency": 0.15,
    "Timeliness": 0.15,
    "Uniqueness": 0.15,
    "Accuracy": 0.10,
    "Integrity": 0.05,
}


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def compute_rule_based_scores(metadata: ExtractedMetadata) -> dict:
    null_ratios = [c.null_ratio or 0.0 for c in metadata.columns]
    completeness = 1.0 - _mean(null_ratios) if null_ratios else 1.0

    neg_ratios = [s.negative_value_ratio or 0.0 for s in (metadata.numeric_stats or {}).values()]
    validity = 1.0 - _mean(neg_ratios) if neg_ratios else 1.0
    accuracy = validity

    format_scores = [
        (s.dominant_case_ratio or 1.0) * (s.dominant_length_ratio or 1.0)
        for s in (metadata.format_stats or {}).values()
    ]
    consistency = _mean(format_scores) if format_scores else 1.0

    temporal_penalties = [
        min(1.0, (s.future_timestamp_ratio or 0.0) + (s.stale_record_ratio or 0.0))
        for s in (metadata.temporal_stats or {}).values()
    ]
    timeliness = 1.0 - _mean(temporal_penalties) if temporal_penalties else 1.0

    unique_ratios = [c.unique_ratio or 0.0 for c in metadata.columns]
    uniqueness = max(unique_ratios) if unique_ratios else 1.0
    integrity = uniqueness

    dimension_scores = {
        "Completeness": round(completeness, 4),
        "Accuracy": round(accuracy, 4),
        "Consistency": round(consistency, 4),
        "Validity": round(validity, 4),
        "Timeliness": round(timeliness, 4),
        "Uniqueness": round(uniqueness, 4),
        "Integrity": round(integrity, 4),
    }

    composite_dqs = round(
        sum(dimension_scores[dim] * w for dim, w in WEIGHTS.items()), 4
    )

    issues = []
    for dim, score in dimension_scores.items():
        if score >= 0.95:
            issues.append({
                "dimension": dim,
                "issue": "No issues identified",
                "affected_columns": [],
                "description": "No specific issues were identified for this dimension.",
            })
        else:
            issues.append({
                "dimension": dim,
                "issue": f"{dim} score below threshold ({score:.2f})",
                "affected_columns": [c.column_name for c in metadata.columns],
                "description": (
                    f"Deterministic rule-based check flagged {dim} at {score:.2f}, "
                    "below the 0.95 healthy-dimension threshold."
                ),
            })

    return {
        "status": "success",
        "data_quality_issues": issues,
        "remediation_actions": [],
        "regulatory_compliance_risks": [],
        "composite_dqs": composite_dqs,
        "dimension_scores": dimension_scores,
    }
