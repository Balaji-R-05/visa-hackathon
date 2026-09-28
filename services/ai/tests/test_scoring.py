import math

import pytest

from common.schemas import DIMENSIONS, ExtractedMetadata
from insight_service.grounding import report_texts, verify
from scoring_service.engine import WEIGHT_PROFILES, score


def test_scores_are_deterministic(metadata):
    assert score(metadata).model_dump() == score(metadata).model_dump()


def test_fingerprint_ignores_run_identifiers(raw_metadata):
    a = score(ExtractedMetadata.model_validate(raw_metadata))
    raw_metadata["dataset"]["dataset_id"] = "another-run"
    raw_metadata["dataset"]["ingestion_timestamp"] = "2030-01-01T00:00:00Z"
    b = score(ExtractedMetadata.model_validate(raw_metadata))
    assert a.metadata_fingerprint == b.metadata_fingerprint


def test_composite_is_weighted_sum_of_applicable_dimensions(report):
    scored = [d for d in report.dimensions if d.applicable]
    assert math.isclose(sum(d.weight for d in scored), 1.0, abs_tol=1e-3)
    assert math.isclose(report.composite_dqs, sum(d.weight * d.score for d in scored), abs_tol=1e-3)


def test_pooled_formula_matches_evidence(report):
    for d in report.dimensions:
        if not d.applicable or d.dimension == "Uniqueness":
            continue
        checked = sum(e.checked for e in d.evidence)
        violations = sum(e.violations for e in d.evidence)
        assert math.isclose(d.score, 1 - violations / checked, abs_tol=1e-4)


def test_missing_signal_is_not_applicable_not_perfect(raw_metadata):
    raw_metadata["rule_evaluation"]["column_checks"] = [
        c for c in raw_metadata["rule_evaluation"]["column_checks"] if c["dimension"] != "Timeliness"
    ]
    r = score(ExtractedMetadata.model_validate(raw_metadata))
    timeliness = next(d for d in r.dimensions if d.dimension == "Timeliness")
    assert not timeliness.applicable and timeliness.score is None
    assert "Timeliness" not in r.dimension_scores
    others = sum(WEIGHT_PROFILES["payments"][d] for d in DIMENSIONS if d != "Timeliness")
    completeness = next(d for d in r.dimensions if d.dimension == "Completeness")
    assert math.isclose(completeness.weight, 0.20 / others, abs_tol=1e-3)


def test_injected_defects_are_found(report):
    flagged = {(f.dimension, f.columns[0]) for f in report.findings}
    assert ("Validity", "amount") in flagged           # negative amounts
    assert ("Validity", "pan_number") in flagged       # truncated PANs
    assert ("Consistency", "currency") in flagged      # lower-case codes
    assert ("Uniqueness", "(all columns)") in flagged  # duplicated rows
    assert ("Timeliness", "txn_timestamp") in flagged
    assert ("Completeness", "kyc_address") in flagged


def test_clean_columns_are_not_flagged(report):
    flagged = {(f.dimension, f.columns[0]) for f in report.findings}
    for col in ("merchant_name", "payment_method", "status", "email", "kyc_address"):
        assert ("Consistency", col) not in flagged
    assert not any(f.dimension == "Integrity" for f in report.findings)


def test_duplicate_rows_are_not_double_counted(report):
    assert [f.columns[0] for f in report.findings if f.dimension == "Uniqueness"] == ["(all columns)"]


def test_priorities_follow_severity(report):
    order = {"critical": 1, "high": 2, "medium": 3, "low": 4}
    for action in report.remediation_actions:
        assert action.priority == order[action.severity]
    assert [a.priority for a in report.remediation_actions] == sorted(a.priority for a in report.remediation_actions)


def test_kyc_findings_are_escalated_with_regulatory_context(report):
    kyc = next(f for f in report.findings if f.columns[0] == "kyc_address" and f.dimension == "Completeness")
    assert kyc.severity in ("high", "critical")
    assert "KYC" in kyc.regulatory_context


def test_template_text_is_fully_grounded(report):
    g = verify(report_texts(report), report)
    assert g.numeric_claims > 20
    assert g.score == 1.0, g.unverified_claims


@pytest.mark.parametrize("profile", ["payments", "generic"])
def test_weight_profiles_sum_to_one(profile):
    assert math.isclose(sum(WEIGHT_PROFILES[profile].values()), 1.0)


def test_held_rules_are_reported_but_not_scored(raw_metadata):
    base = score(ExtractedMetadata.model_validate(raw_metadata))
    held = {
        "id": "L:Validity:allowed_values:status:0", "source": "llm", "dimension": "Validity", "type": "allowed_values",
        "column": "status", "params": {"values": ["X"]}, "description": "status must be X", "regulation": "Made-up Act",
        "status": "held", "hold_reason": "fails 100.0% of checked values", "checked": 1100, "violations": 1100,
        "violation_ratio": 1.0,
    }
    raw_metadata["rule_evaluation"]["rules"].append(held)
    r = score(ExtractedMetadata.model_validate(raw_metadata))
    assert r.dimension_scores == base.dimension_scores                 # a held rule never moves a score
    assert [h["id"] for h in r.rules["held"]] == [held["id"]]
    assert all(a["id"] != held["id"] for a in r.rules["applied"])
    assert "Made-up Act" not in " ".join(f.regulatory_context or "" for f in r.findings)
    assert all("params" in a for a in r.rules["applied"])              # exportable as an approved rule set
