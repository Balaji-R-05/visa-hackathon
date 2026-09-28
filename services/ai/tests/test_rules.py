import asyncio

from common import llm
from common.schemas import ProposedRule, RuleDerivationRequest, RuleProposalSet
from rule_service import deriver

COLUMNS = ["txn_id", "amount", "currency", "ifsc", "txn_date", "settle_date"]
BLANK = dict(pattern=None, values=None, case_sensitive=None, min=None, max=None, when_column=None,
             op=None, other_column=None, max_age_days=None, regulation=None, citations=None)


def rule(**kw) -> ProposedRule:
    return ProposedRule(**{**BLANK, "description": "d", "rationale": "r", **kw})


def test_valid_proposals_become_executable_rules():
    accepted, rejected, _ = deriver.validate(RuleProposalSet(rules=[
        rule(column="ifsc", dimension="Validity", type="regex", pattern="^[A-Z]{4}0[A-Z0-9]{6}$", regulation="RBI"),
        rule(column="amount", dimension="Accuracy", type="range", min=0, max=1e7),
        rule(column="settle_date", dimension="Integrity", type="column_compare", op=">=", other_column="txn_date"),
    ], optional_columns=["settle_date", "nope"]), COLUMNS)
    assert not rejected
    assert [r.type for r in accepted] == ["regex", "range", "column_compare"]
    assert accepted[0].source == "llm" and accepted[0].params == {"pattern": "^[A-Z]{4}0[A-Z0-9]{6}$"}
    assert accepted[2].params == {"op": ">=", "other_column": "txn_date"}


def test_invalid_proposals_are_rejected_with_reasons():
    accepted, rejected, optional = deriver.validate(RuleProposalSet(rules=[
        rule(column="ghost", dimension="Validity", type="not_null"),
        rule(column="ifsc", dimension="Validity", type="regex", pattern="^(a+)+$"),
        rule(column="ifsc", dimension="Validity", type="regex", pattern="[unclosed"),
        rule(column="currency", dimension="Validity", type="allowed_values"),
        rule(column="amount", dimension="Accuracy", type="range", min=5, max=1),
        rule(column="settle_date", dimension="Integrity", type="column_compare", op=">=", other_column="ghost"),
    ], optional_columns=["nope"]), COLUMNS)
    assert accepted == [] and optional == []
    reasons = [r.reason for r in rejected]
    assert "unknown column(s): ghost" in reasons[0]
    assert "nested quantifiers" in reasons[1]
    assert "invalid regex" in reasons[2]
    assert "requires values" in reasons[3]
    assert reasons[4] == "min > max"
    assert "ghost" in reasons[5]


def test_duplicates_are_rejected():
    r = rule(column="amount", dimension="Validity", type="range", min=0)
    accepted, rejected, _ = deriver.validate(RuleProposalSet(rules=[r, r], optional_columns=[]), COLUMNS)
    assert len(accepted) == 1 and rejected[0].reason.startswith("duplicate")


def _request(raw_metadata, jurisdiction="IN"):
    return RuleDerivationRequest(
        dataset=raw_metadata["dataset"], columns=raw_metadata["columns"],
        categorical_stats=raw_metadata["categorical_stats"], jurisdiction=jurisdiction,
    )


def test_citations_must_come_from_retrieved_clauses():
    accepted, _, _ = deriver.validate(RuleProposalSet(rules=[
        rule(column="amount", dimension="Validity", type="range", min=0, citations=["GDPR:Article 5", "MADE_UP:Section 9"]),
    ], optional_columns=[]), COLUMNS)
    stats = deriver.check_citations(accepted, {"GDPR:Article 5"})
    assert accepted[0].citations == ["GDPR:Article 5"] and accepted[0].regulation == "GDPR:Article 5"
    assert stats == {"cited": 2, "valid": 1, "fabricated": ["MADE_UP:Section 9"], "precision": 0.5,
                     "rules_with_citation": 1, "uncited_regulations": 0}


def test_uncited_regulation_labels_are_marked():
    accepted, _, _ = deriver.validate(RuleProposalSet(rules=[
        rule(column="currency", dimension="Validity", type="allowed_values", values=["INR"], regulation="DPDP Act 2023"),
    ], optional_columns=[]), COLUMNS)
    stats = deriver.check_citations(accepted, {"RBI_KYC:Section 16"})
    assert accepted[0].regulation == "DPDP Act 2023 (uncited)" and stats["uncited_regulations"] == 1
    accepted, _, _ = deriver.validate(RuleProposalSet(rules=[
        rule(column="currency", dimension="Validity", type="allowed_values", values=["INR"], regulation="ISO 4217"),
    ], optional_columns=[]), COLUMNS)
    deriver.check_citations(accepted, set())  # no corpus: nothing to verify against, label kept as is
    assert accepted[0].regulation == "ISO 4217"


def test_policy_queries_follow_profile():
    qs = deriver.policy_queries([{"sensitivity": ["kyc"]}, {"sensitivity": ["pii"], "semantic_type": "timestamp"}], "Payments")
    assert qs == [deriver.TOPIC_QUERIES[t] for t in ("kyc", "pii", "timestamp", "payments", "aml")]


def test_prompt_uses_profiles_jurisdiction_and_clauses(raw_metadata, monkeypatch):
    seen = {}

    async def clauses(queries, jurisdiction):
        seen["jurisdiction"] = jurisdiction
        return [{"id": "RBI_KYC:Section 16", "title": "KYC Direction", "authority": "official", "text": "Address must be verified."}], "lexical"

    monkeypatch.setattr(deriver, "retrieve_clauses", clauses)

    async def fake(prompt, schema, temperature=None, max_tokens=None):
        seen["prompt"] = prompt
        return RuleProposalSet(rules=[rule(column="pan_number", dimension="Validity", type="regex",
                                           pattern="^[A-Z]{5}[0-9]{4}[A-Z]$", citations=["RBI_KYC:Section 16", "FAKE:1"])], optional_columns=[])

    monkeypatch.setattr(llm, "structured_invoke", fake)
    res = asyncio.run(deriver.derive(_request(raw_metadata)))
    assert res.status == "ok" and len(res.rules) == 1 and res.proposed == 1
    assert "[RBI_KYC:Section 16]" in seen["prompt"] and seen["jurisdiction"] == "IN"
    assert res.rules[0].citations == ["RBI_KYC:Section 16"] and res.citation_stats["fabricated"] == ["FAKE:1"]
    assert res.policy_context == {"retrieval": "lexical", "clauses": ["RBI_KYC:Section 16"]}
    assert "AAAAA9999A" in seen["prompt"]          # format masks reach the model
    assert "RBI KYC" in seen["prompt"]             # jurisdiction guidance
    assert res.redactions == {}                    # profiles carry masks, never values


def test_unavailable_llm_returns_empty_rule_set(raw_metadata, monkeypatch):
    async def no_clauses(queries, jurisdiction):
        return [], "unavailable"

    monkeypatch.setattr(deriver, "retrieve_clauses", no_clauses)

    async def down(prompt, schema, temperature=None, max_tokens=None):
        raise llm.LLMUnavailable("connection refused")

    monkeypatch.setattr(llm, "structured_invoke", down)
    res = asyncio.run(deriver.derive(_request(raw_metadata, "XX")))
    assert res.status == "unavailable" and res.rules == []


def test_type_errors_are_rejected_before_execution():
    semantics = {"txn_id": "identifier", "amount": "monetary_amount"}
    accepted, rejected, _ = deriver.validate(RuleProposalSet(rules=[
        rule(column="txn_id", dimension="Validity", type="range", min=13, max=16),
        rule(column="amount", dimension="Accuracy", type="range", min=0),
    ], optional_columns=[]), COLUMNS, semantics)
    assert [r.column for r in accepted] == ["amount"]
    assert "range compares numeric magnitudes" in rejected[0].reason

    accepted, rejected, _ = deriver.validate(RuleProposalSet(rules=[
        rule(column="dob", dimension="Timeliness", type="date_max_age", max_age_days=36500),
    ], optional_columns=[]), COLUMNS + ["dob"], {})
    assert accepted == [] and "not an event timestamp" in rejected[0].reason
