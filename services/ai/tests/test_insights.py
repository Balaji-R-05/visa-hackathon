import asyncio

from common import llm
from insight_service import narrative
from insight_service.grounding import allowed_numbers, extract_claims, verify
from insight_service.narrative import DimensionNarrative, FindingAdvice, NarrativeOutput


def _fake_llm(output):
    async def fake(prompt, schema, temperature=None, max_tokens=None):
        assert "REPORT" in prompt
        if isinstance(output, Exception):
            raise output
        return output
    return fake


def test_citations_and_small_ints_are_not_claims():
    claims = extract_claims("BCBS 239 Principle 4 and GDPR Art. 5(1)(d) apply to 3 columns (F2) since 2023.")
    assert claims == []


def test_hallucinated_numbers_are_flagged(report):
    _, fracs = allowed_numbers(report)
    fake_pct = next(p / 100 for p in range(1, 10000) if all(abs(p / 100 - f * 100) > 1.5 for f in fracs))
    f = report.findings[0]
    g = verify([f"{f.violations} records fail, about {fake_pct:.2f}% of rows, costing 999,999 dollars."], report)
    assert g.numeric_claims == 3
    assert g.verified == 1
    assert set(g.unverified_claims) == {f"{fake_pct:.2f}%", "999,999"}
    assert g.rounded_claims == []
    rounded = verify([f"about {round(f.violation_ratio * 100)}% fail"], report)
    assert rounded.rounded_claims == rounded.unverified_claims or rounded.score == 1.0


def test_grounded_narrative_is_merged(report, monkeypatch):
    f = report.findings[0]
    out = NarrativeOutput(
        executive_summary=f"Composite DQS is {report.composite_dqs}. {f.violations} values in {f.columns[0]} fail.",
        dimension_narratives=[DimensionNarrative(dimension="Validity", narrative="Formats matter for settlement.")],
        recommendations=[FindingAdvice(finding_id=f.id, action="Fix it at source", rationale="Removes KYC exposure.")],
        compliance_insights=["KYC readiness is at risk."],
    )
    monkeypatch.setattr(llm, "structured_invoke", _fake_llm(out))
    enriched = asyncio.run(narrative.explain(report))
    assert enriched.narrative_source == "llm"
    assert enriched.grounding.score == 1.0
    assert enriched.remediation_actions[0].action == "Fix it at source"
    assert enriched.dimension_scores == report.dimension_scores  # the LLM never changes scores
    assert "KYC readiness is at risk." in enriched.regulatory_compliance_risks


def test_ungrounded_narrative_is_rejected(report, monkeypatch):
    out = NarrativeOutput(
        executive_summary="Roughly 42.42% of records are bad and 31,337 rows are duplicated; 77.7% are stale.",
        dimension_narratives=[], recommendations=[], compliance_insights=[],
    )
    monkeypatch.setattr(llm, "structured_invoke", _fake_llm(out))
    result = asyncio.run(narrative.explain(report))
    assert result.narrative_source == "template"
    assert result.executive_summary == report.executive_summary
    assert "narrative_rejected" in result.governance


def test_llm_outage_falls_back_to_template(report, monkeypatch):
    monkeypatch.setattr(llm, "structured_invoke", _fake_llm(llm.LLMUnavailable("ollama down")))
    result = asyncio.run(narrative.explain(report))
    assert result.narrative_source == "template"
    assert result.composite_dqs == report.composite_dqs
    assert "narrative_error" in result.governance


def test_prompt_view_carries_no_data_values(report, raw_metadata):
    view = narrative.prompt_view(report)
    text = str(view)
    for col, cat in raw_metadata["categorical_stats"].items():
        if cat.get("top_values_suppressed"):
            continue
        # disclosed top values are low-cardinality codes and are not forwarded either
        for v in cat["top_values"]:
            assert f"'{v}'" not in text or v in ("INR", "USD", "EUR", "GBP")


def test_auth_errors_count_as_unavailable():
    assert llm._is_connection_error(RuntimeError("Error code: 401 - {'error': {'code': 'invalid_api_key'}}"))
    assert not llm._is_connection_error(ValueError("could not parse JSON"))


def test_narrative_prompt_needs_no_redaction(report):
    from common.governance import redact

    assert redact(narrative.prompt_view(report))[1] == {}
