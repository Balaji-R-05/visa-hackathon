"""
LLM rule derivation: column profiles in, executable DSL rules out.

The model sees only privacy-safe column profiles (type, null/unique ratios,
format masks such as "AAAAA9999A", top values of non-sensitive low-cardinality
columns) plus the jurisdiction. Every proposal is validated here and again in
the data-plane before it touches data; invalid proposals are returned as
rejected with a reason, which is itself an evaluation signal.
"""

import json
import re
import time
from typing import Dict, List, Optional, Set, Tuple

import httpx

from common import config, llm
from common.governance import redact
from common.health import internal_headers
from common.logger import logger
from common.schemas import (
    ProposedRule, RejectedRule, RuleDerivationRequest, RuleDerivationResponse, RuleProposalSet, RuleSpec,
)

MAX_RULES = 60
MAX_PATTERN_LENGTH = 256
NESTED_QUANTIFIER = re.compile(r"\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]")

JURISDICTION_GUIDANCE = {
    "IN": (
        "India. RBI KYC Master Direction: customer identity and address fields must be present and well-formed. "
        "PAN (tax id) format is five letters, four digits, one letter. Aadhaar numbers must never be stored unmasked. "
        "IFSC codes, UPI virtual payment addresses and six-digit PIN codes have fixed formats. "
        "Personal data falls under the DPDP Act 2023."
    ),
    "EU": (
        "European Union. GDPR accuracy and data-minimisation principles apply to personal data. "
        "IBAN and BIC have fixed formats; countries use ISO 3166-1 codes; PSD2 governs payment transaction data."
    ),
    "US": (
        "United States. GLBA Safeguards Rule covers customer financial data; SSNs must be stored masked. "
        "ZIP codes are five digits with an optional four-digit extension; ABA routing numbers are nine digits. "
        "BSA/AML record-keeping requires complete transaction records."
    ),
    "GLOBAL": (
        "No specific jurisdiction. Apply PCI DSS to card data (no stored card verification codes, PAN unreadable at rest), "
        "ISO 4217 currency codes, ISO 8601 timestamps and FATF customer due diligence expectations."
    ),
}

# Retrieval topics, chosen from what the profile says the dataset contains.
TOPIC_QUERIES = {
    "kyc": "customer identification KYC due diligence identity address documents record keeping",
    "pii": "personal data accuracy data minimisation retention rectification erasure",
    "pci": "cardholder data primary account number storage masking encryption card verification",
    "payments": "payment transaction records completeness retention reporting data localisation",
    "aml": "anti money laundering suspicious transaction monitoring record keeping reporting",
    "timestamp": "record retention period timely reporting of transactions",
}
MAX_CLAUSE_CHARS = 700
POLICY_K = 8

RULE_PROMPT = """You are a data governance engineer for a payments organisation. Propose data quality rules for the dataset profiled below.

Jurisdiction: {jurisdiction}
{guidance}

Regulatory context retrieved for this jurisdiction:
{clauses}

Dataset: {row_count} rows, domain {domain}.
Column profiles (one JSON object per column). "shapes" are format masks of the values: A = uppercase letter, a = lowercase letter, 9 = digit, other characters literal; "share" is the fraction of values with that mask. "all_values" is the complete list of observed values and is only present for low-cardinality, non-sensitive columns.
{columns}

Rule types you may use (each rule targets one column):
- not_null: column must be populated (dimension Completeness, or Integrity for key columns).
- conditional_required: column must be populated whenever when_column is populated.
- regex: value must fully match `pattern` (use ^ and $, standard syntax, no lookbehind, no nested quantifiers such as (a+)+).
- allowed_values: value must be one of `values`; set case_sensitive.
- range: numeric value within min/max (either may be null).
- length: string length within min/max.
- luhn: card number checksum.
- date_parseable: value must be a valid date/time.
- date_not_future: timestamp not in the future.
- date_max_age: timestamp not older than max_age_days.
- column_compare: `column` op `other_column` must hold (numbers or dates), e.g. a settlement date on or after a transaction date.
- unique: values must not repeat (dimension Uniqueness).

Guidance:
- Derive formats from the shapes and semantic types. Use allowed_values only when all_values is clearly a closed code list; values that differ only in letter case are a Consistency issue, so set case_sensitive false for such lists.
- Choose the dimension that the rule measures: format and domain rules are Validity; plausibility bounds are Accuracy; cross-field and key rules are Integrity; freshness is Timeliness.
- Prefer rules a regulator or data steward in this jurisdiction would actually enforce.
- When a rule enforces a retrieved clause, put that clause's id (the text in square brackets) in `citations`. Only cite ids listed in the regulatory context above; never invent ids.
- Do not propose rules for columns you cannot reason about, and do not restate the not-null baseline for every column.
- List in optional_columns any column that may legitimately be empty (for example a refund reason on a purchase).
- Set every field not used by a rule type to null.
"""

REQUIRED_PARAMS = {
    "regex": ("pattern",),
    "allowed_values": ("values",),
    "conditional_required": ("when_column",),
    "column_compare": ("op", "other_column"),
    "date_max_age": ("max_age_days",),
}


def profile_view(req: RuleDerivationRequest) -> List[dict]:
    cats = req.categorical_stats or {}
    view = []
    for c in req.columns:
        name = c.get("column_name")
        entry = {
            "name": name,
            "type": c.get("inferred_data_type"),
            "semantic_guess": c.get("semantic_type"),
            "null_ratio": round(c.get("null_ratio") or 0, 3),
            "distinct": c.get("unique_count"),
            "unique_ratio": round(c.get("unique_ratio") or 0, 3),
            "key": c.get("is_key", False),
            "sensitivity": c.get("sensitivity") or [],
            "shapes": [{"shape": s.get("shape"), "share": round(float(s.get("share", 0)), 3)} for s in c.get("shape_signatures") or []],
        }
        cat = cats.get(name) or {}
        if cat.get("values") and not cat.get("top_values_suppressed"):
            entry["all_values"] = cat["values"]
        view.append(entry)
    return view


def policy_queries(columns: List[dict], domain: str) -> List[str]:
    topics: List[str] = []
    for c in columns:
        topics += c.get("sensitivity") or []
        if c.get("semantic_type") == "timestamp":
            topics.append("timestamp")
    if domain == "Payments":
        topics += ["payments", "aml"]
    return [TOPIC_QUERIES[t] for t in dict.fromkeys(topics) if t in TOPIC_QUERIES] or [TOPIC_QUERIES["payments"]]


async def retrieve_clauses(queries: List[str], jurisdiction: str) -> Tuple[List[dict], str]:
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(
                f"{config.POLICY_SERVICE_URL}/policies/retrieve",
                json={"queries": queries, "jurisdiction": jurisdiction, "k": POLICY_K},
                headers=internal_headers(),
            )
            res.raise_for_status()
            body = res.json()
            return body.get("clauses", []), body.get("retrieval", "unknown")
    except Exception as exc:
        logger.warning(f"Policy retrieval unavailable ({exc}); using static jurisdiction guidance only")
        return [], "unavailable"


def format_clauses(clauses: List[dict]) -> str:
    if not clauses:
        return "(no regulatory documents were retrieved; leave citations null)"
    lines = []
    for c in clauses:
        text = " ".join(c["text"].split())
        text = text if len(text) <= MAX_CLAUSE_CHARS else text[:MAX_CLAUSE_CHARS] + " ..."
        lines.append(f"[{c['id']}] ({c['title']}; {c['authority']}) {text}")
    return "\n".join(lines)


def to_rule(p: ProposedRule, index: int) -> Tuple[Optional[RuleSpec], Optional[str]]:
    for field in REQUIRED_PARAMS.get(p.type, ()):
        if getattr(p, field) in (None, "", []):
            return None, f"{p.type} requires {field}"
    params: Dict = {}
    if p.type == "regex":
        if len(p.pattern) > MAX_PATTERN_LENGTH:
            return None, "pattern too long"
        if NESTED_QUANTIFIER.search(p.pattern):
            return None, "pattern has nested quantifiers (backtracking risk)"
        try:
            re.compile(p.pattern)
        except re.error as e:
            return None, f"invalid regex: {e}"
        params = {"pattern": p.pattern}
    elif p.type == "allowed_values":
        params = {"values": [str(v) for v in p.values], "case_sensitive": p.case_sensitive is not False}
    elif p.type in ("range", "length"):
        if p.min is None and p.max is None:
            return None, f"{p.type} requires min or max"
        if p.min is not None and p.max is not None and p.min > p.max:
            return None, "min > max"
        cast = int if p.type == "length" else float
        params = {k: cast(v) for k, v in (("min", p.min), ("max", p.max)) if v is not None}
    elif p.type == "conditional_required":
        params = {"when_column": p.when_column}
    elif p.type == "column_compare":
        params = {"op": p.op, "other_column": p.other_column}
    elif p.type == "date_max_age":
        if p.max_age_days <= 0:
            return None, "max_age_days must be positive"
        params = {"max_age_days": float(p.max_age_days)}
    elif p.type == "date_not_future":
        params = {"tolerance_days": 1}
    return RuleSpec(
        id=f"L:{p.dimension}:{p.type}:{p.column}:{index}",
        source="llm",
        dimension=p.dimension,
        type=p.type,
        column=p.column,
        params=params,
        description=p.description,
        rationale=p.rationale,
        regulation=p.regulation,
        citations=[c.strip() for c in (p.citations or []) if c and c.strip()],
    ), None


def check_citations(rules: List[RuleSpec], valid_ids: Set[str]) -> Dict:
    """Keeps only citations of retrieved clauses; fabricated ids are dropped and counted.
    When clauses were retrieved, a regulation label with no valid citation is marked
    "(uncited)" so a model-asserted attribution never reads as a verified one."""
    made = valid = 0
    fabricated: List[str] = []
    uncited: List[str] = []
    for r in rules:
        kept = []
        for c in r.citations:
            made += 1
            if c in valid_ids:
                valid += 1
                kept.append(c)
            else:
                fabricated.append(c)
        r.citations = kept
        if kept:
            r.regulation = "; ".join(kept)
        elif r.regulation and valid_ids:
            uncited.append(r.regulation)
            r.regulation = f"{r.regulation} (uncited)"
    return {
        "cited": made,
        "valid": valid,
        "fabricated": list(dict.fromkeys(fabricated)),
        "precision": (valid / made) if made else None,
        "rules_with_citation": sum(1 for r in rules if r.citations),
        "uncited_regulations": len(uncited),
    }


IDENTIFIER_TYPES = {"identifier", "card_pan", "tax_id_pan", "phone", "card_security_code", "email"}
NON_EVENT_DATE = re.compile(r"(birth|dob|expir|valid_?(to|until)|maturity)", re.I)


def semantic_error(p: ProposedRule, semantics: Dict[str, str]) -> Optional[str]:
    """Type errors a well-formed rule can still contain (mirrors the data-plane's checks)."""
    if p.type == "range" and semantics.get(p.column) in IDENTIFIER_TYPES:
        return f"range compares numeric magnitudes; '{p.column}' is {semantics[p.column]} (use length or regex)"
    if p.type in ("date_not_future", "date_max_age") and p.dimension == "Timeliness" and NON_EVENT_DATE.search(p.column):
        return f"'{p.column}' is not an event timestamp, so its age does not measure timeliness"
    return None


def validate(proposals: RuleProposalSet, columns: List[str], semantics: Optional[Dict[str, str]] = None
             ) -> Tuple[List[RuleSpec], List[RejectedRule], List[str]]:
    names = set(columns)
    semantics = semantics or {}
    accepted: List[RuleSpec] = []
    rejected: List[RejectedRule] = []
    seen = set()
    for i, p in enumerate(proposals.rules):
        raw = p.model_dump()
        if len(accepted) >= MAX_RULES:
            rejected.append(RejectedRule(rule=raw, reason=f"rule limit of {MAX_RULES} reached"))
            continue
        missing = [c for c in (p.column, p.when_column if p.type == "conditional_required" else None,
                               p.other_column if p.type == "column_compare" else None) if c and c not in names]
        if p.column not in names or missing:
            rejected.append(RejectedRule(rule=raw, reason=f"unknown column(s): {', '.join(missing or [p.column])}"))
            continue
        type_error = semantic_error(p, semantics)
        if type_error:
            rejected.append(RejectedRule(rule=raw, reason=type_error))
            continue
        rule, reason = to_rule(p, i)
        if rule is None:
            rejected.append(RejectedRule(rule=raw, reason=reason))
            continue
        key = (rule.type, rule.column, json.dumps(rule.params, sort_keys=True))
        if key in seen:
            rejected.append(RejectedRule(rule=raw, reason="duplicate of an earlier proposal"))
            continue
        seen.add(key)
        accepted.append(rule)
    optional = [c for c in proposals.optional_columns if c in names]
    return accepted, rejected, optional


async def derive(req: RuleDerivationRequest) -> RuleDerivationResponse:
    jurisdiction = req.jurisdiction.upper() if req.jurisdiction.upper() in JURISDICTION_GUIDANCE else "GLOBAL"
    view, redactions = redact(profile_view(req))
    clauses, retrieval = await retrieve_clauses(
        policy_queries(req.columns, req.dataset.get("detected_domain", "")), jurisdiction
    )
    policy_context = {"retrieval": retrieval, "clauses": [c["id"] for c in clauses]}
    prompt = RULE_PROMPT.format(
        jurisdiction=jurisdiction,
        guidance=JURISDICTION_GUIDANCE[jurisdiction],
        clauses=format_clauses(clauses),
        row_count=req.dataset.get("row_count", "unknown"),
        domain=req.dataset.get("detected_domain", "unknown"),
        columns="\n".join(json.dumps(v) for v in view),
    )
    base = {"model": llm.model_id(), "local_model": llm.is_local(), "redactions": redactions, "policy_context": policy_context}
    started = time.perf_counter()
    try:
        proposals = await llm.structured_invoke(prompt, RuleProposalSet, max_tokens=4000)
    except llm.LLMUnavailable as exc:
        logger.warning(f"Rule derivation unavailable: {exc}")
        return RuleDerivationResponse(rules=[], status="unavailable", error=str(exc)[:300], **base)
    except llm.LLMOutputError as exc:
        logger.warning(f"Rule derivation produced unusable output: {exc}")
        return RuleDerivationResponse(
            rules=[], status="failed", error=str(exc)[:300],
            latency_ms=round((time.perf_counter() - started) * 1000, 1), **base,
        )
    latency = round((time.perf_counter() - started) * 1000, 1)
    accepted, rejected, optional = validate(
        proposals,
        [c.get("column_name") for c in req.columns],
        {c.get("column_name"): c.get("semantic_type") for c in req.columns},
    )
    citation_stats = check_citations(accepted, {c["id"] for c in clauses})
    logger.info(
        f"Derived {len(accepted)} rules ({len(rejected)} rejected, {citation_stats['valid']}/{citation_stats['cited']} "
        f"citations valid) in {latency} ms with {llm.model_id()}"
    )
    return RuleDerivationResponse(
        rules=accepted, optional_columns=optional, rejected=rejected, latency_ms=latency,
        proposed=len(proposals.rules), citation_stats=citation_stats, **base,
    )
