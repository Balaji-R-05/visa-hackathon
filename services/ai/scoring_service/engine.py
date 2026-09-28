"""
Deterministic, evidence-carrying Data Quality Score engine.

Every number in a report is a pure function of the metadata: identical metadata
yields an identical report (checked by `metadata_fingerprint`). No LLM is
involved — LLMs may propose rules upstream and narrate results downstream, but
never produce a score.

Per dimension d with evidence items i (one per checked column or check):
    S_d = 1 - sum_i violations_i / sum_i checked_i        (pooled ratio)
    S_Uniqueness = 1 - max_i violation_ratio_i            (row- and key-level duplicates overlap)
A dimension with no evidence is *not applicable*: it is excluded and the
remaining weights are renormalized, so an absent signal never counts as a
perfect score.
    DQS = sum_{d applicable} w'_d * S_d,   w'_d = w_d / sum_{applicable} w
"""

import hashlib
import json
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from common.schemas import (
    DIMENSIONS, ColumnEvidence, DimensionResult, DQIssue, DQSReport, ExtractedMetadata, Finding, RemediationAction,
)

ENGINE_VERSION = "1.0.0"
REPORT_VERSION = "2.0"

WEIGHT_PROFILES: Dict[str, Dict[str, float]] = {
    # Payments: missing/invalid values block settlement and KYC, duplicates cause
    # double-posting, and broken key/amount-currency links break reconciliation.
    "payments": {
        "Completeness": 0.20, "Validity": 0.20, "Uniqueness": 0.15, "Integrity": 0.15,
        "Accuracy": 0.10, "Consistency": 0.10, "Timeliness": 0.10,
    },
    "generic": {d: 1 / len(DIMENSIONS) for d in DIMENSIONS},
}

FORMULAS = {
    "Completeness": "1 − empty required cells ÷ required cells (pooled over required columns)",
    "Validity": "1 − values failing ≥1 format/domain rule ÷ values checked (pooled over rule-bearing columns)",
    "Accuracy": "1 − implausible values ÷ values checked (IQR outliers on amounts and accuracy rules)",
    "Consistency": "1 − values deviating from the column's dominant representation ÷ values checked",
    "Uniqueness": "1 − max(duplicate-row ratio, duplicate-key ratio)",
    "Timeliness": "1 − future-dated or out-of-window timestamps ÷ timestamps checked",
    "Integrity": "1 − key/dependency rule violations ÷ rows checked",
}

NOT_APPLICABLE_REASONS = {
    "Completeness": "the dataset has no rows or no required columns",
    "Validity": "no column has a recognised format or domain rule",
    "Accuracy": "no monetary column with enough values and no accuracy rules",
    "Consistency": "no code-like or fixed-format columns to compare representations in",
    "Uniqueness": "no duplicate statistics in the metadata",
    "Timeliness": "no event-timestamp columns detected",
    "Integrity": "no key columns or cross-field dependencies detected",
}

# Regulatory context attached to findings, by (dimension, sensitivity tag or None).
REGULATORY_CONTEXT = {
    ("Completeness", "kyc"): "KYC/CDD record-keeping (RBI KYC Master Direction 2016; FATF Recommendation 10)",
    ("Validity", "kyc"): "KYC/CDD data accuracy (RBI KYC Master Direction 2016; FATF Recommendation 10)",
    ("Completeness", "pci"): "Cardholder-data handling (PCI DSS v4.0)",
    ("Validity", "pci"): "Cardholder-data handling (PCI DSS v4.0)",
    ("Completeness", "pii"): "Personal-data accuracy principle (GDPR Art. 5(1)(d); India DPDP Act 2023 s.8(3))",
    ("Validity", "pii"): "Personal-data accuracy principle (GDPR Art. 5(1)(d); India DPDP Act 2023 s.8(3))",
    ("Completeness", None): "Risk-data completeness (BCBS 239 Principle 4)",
    ("Accuracy", None): "Risk-data accuracy and integrity (BCBS 239 Principle 3)",
    ("Integrity", None): "Risk-data accuracy and integrity (BCBS 239 Principle 3)",
    ("Timeliness", None): "Risk-data timeliness (BCBS 239 Principle 5)",
}

SEVERITY_ORDER = ["low", "medium", "high", "critical"]
SEVERITY_PRIORITY = {"critical": 1, "high": 2, "medium": 3, "low": 4}


def _pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def _fmt_int(n: int) -> str:
    return f"{n:,}"


def fingerprint(metadata: ExtractedMetadata) -> str:
    """Hash of the metadata minus per-run identifiers, so re-profiling the same data yields the same value."""
    payload = metadata.model_dump(mode="json")
    payload["dataset"] = {k: v for k, v in payload["dataset"].items() if k not in ("dataset_id", "ingestion_timestamp")}
    if payload.get("governance"):
        payload["governance"] = {k: v for k, v in payload["governance"].items() if k != "processing"}
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


def grade(score: float) -> str:
    for threshold, label in ((0.95, "A (Excellent)"), (0.90, "B (Good)"), (0.80, "C (Fair)"), (0.70, "D (Poor)")):
        if score >= threshold:
            return label
    return "F (Critical)"


def _collect_evidence(md: ExtractedMetadata) -> Dict[str, List[ColumnEvidence]]:
    evidence: Dict[str, List[ColumnEvidence]] = defaultdict(list)
    rules_by_id = {}
    if md.rule_evaluation:
        rules_by_id = {r.id: r for r in md.rule_evaluation.rules}
        for cc in md.rule_evaluation.column_checks:
            if cc.checked <= 0:
                continue
            rules = [rules_by_id[i] for i in cc.rule_ids if i in rules_by_id]
            failing = [r for r in rules if r.violations > 0] or rules
            desc = "; ".join(dict.fromkeys(r.description or f"{r.type} rule" for r in failing))
            sources = sorted({r.source for r in rules})
            evidence[cc.dimension].append(ColumnEvidence(
                column=cc.column,
                check="+".join(dict.fromkeys(r.type for r in rules)) + f" [{'/'.join(sources)}]",
                description=desc,
                checked=cc.checked,
                violations=cc.violations,
                violation_ratio=cc.violation_ratio,
            ))
    else:
        # Legacy metadata without executed rules: completeness from null counts only.
        n = md.dataset.row_count
        for c in md.columns:
            if n:
                evidence["Completeness"].append(ColumnEvidence(
                    column=c.column_name, check="not_null [legacy]", description=f"{c.column_name} must be populated",
                    checked=n, violations=c.null_count or 0, violation_ratio=(c.null_count or 0) / n,
                ))

    for col, fs in (md.format_stats or {}).items():
        if fs.check and fs.checked > 0:
            evidence["Consistency"].append(ColumnEvidence(
                column=col, check=f"{fs.check} [statistical]", description=fs.check_description or fs.check,
                checked=fs.checked, violations=fs.violations, violation_ratio=fs.violation_ratio,
            ))

    for col, ac in (md.accuracy_checks or {}).items():
        if ac.checked > 0:
            evidence["Accuracy"].append(ColumnEvidence(
                column=col, check=f"{ac.check} [statistical]", description=ac.check_description,
                checked=ac.checked, violations=ac.violations, violation_ratio=ac.violation_ratio,
            ))

    cc = md.cross_column_stats
    n = md.dataset.row_count
    if cc is not None and n > 0:
        evidence["Uniqueness"].append(ColumnEvidence(
            column="(all columns)", check="duplicate_rows [statistical]", description="exact duplicate rows",
            checked=n, violations=cc.duplicate_row_count, violation_ratio=cc.duplicate_row_ratio,
        ))
        null_counts = {c.column_name: c.null_count or 0 for c in md.columns}
        for key, ratio in cc.key_duplicate_ratio.items():
            non_null = n - null_counts.get(key, 0)
            key_dups = round(ratio * non_null)
            if key_dups == cc.duplicate_row_count:
                continue  # key repeats are exactly the duplicated rows; don't count them twice
            evidence["Uniqueness"].append(ColumnEvidence(
                column=key, check="duplicate_key [statistical]", description=f"repeated values in key column {key}",
                checked=non_null, violations=key_dups, violation_ratio=ratio,
            ))
    return evidence


def _score(dimension: str, items: List[ColumnEvidence]) -> Tuple[Optional[float], int, int]:
    checked = sum(i.checked for i in items)
    violations = sum(i.violations for i in items)
    if checked <= 0:
        return None, 0, 0
    if dimension == "Uniqueness":
        return 1.0 - max(i.violation_ratio for i in items), checked, violations
    return 1.0 - violations / checked, checked, violations


def _escalate(severity: str, steps: int = 1) -> str:
    return SEVERITY_ORDER[min(len(SEVERITY_ORDER) - 1, SEVERITY_ORDER.index(severity) + steps)]


def _severity(ratio: float, sensitive: List[str], dimension: str) -> str:
    sev = "high" if ratio >= 0.20 else "medium" if ratio >= 0.05 else "low"
    if dimension in ("Completeness", "Validity") and ({"kyc", "pci"} & set(sensitive)):
        sev = _escalate(sev)
    return sev


def _regulatory_context(dimension: str, sensitive: List[str]) -> Optional[str]:
    for tag in ("kyc", "pci", "pii"):
        if tag in sensitive and (dimension, tag) in REGULATORY_CONTEXT:
            return REGULATORY_CONTEXT[(dimension, tag)]
    return REGULATORY_CONTEXT.get((dimension, None))


def _remediation(f: Finding, sensitive: List[str]) -> Tuple[str, str]:
    col = ", ".join(f.columns)
    check = f.check.split(" ")[0]
    if f.dimension == "Completeness":
        if "kyc" in sensitive:
            return (f"Re-collect missing {col} through the KYC refresh workflow",
                    f"{_fmt_int(f.violations)} records lack {col}; they should not be used for onboarding or regulatory reporting until completed.")
        return (f"Backfill {col} and enforce NOT NULL at the source",
                f"{_fmt_int(f.violations)} of {_fmt_int(f.checked)} values are empty.")
    if f.dimension == "Validity":
        return (f"Validate {col} at ingestion and quarantine failing records",
                f"Enforce '{f.description}' at the producing system; {_fmt_int(f.violations)} values currently fail it.")
    if f.dimension == "Consistency":
        if check == "case_variant":
            return (f"Normalise {col} to one canonical spelling",
                    f"{_fmt_int(f.violations)} values use a non-dominant case/whitespace variant of the same code.")
        return (f"Investigate truncation or format drift in {col}",
                f"{_fmt_int(f.violations)} values break the column's dominant fixed format.")
    if f.dimension == "Uniqueness":
        return (f"Deduplicate on the natural key and add a unique constraint on {col}",
                f"{_fmt_int(f.violations)} duplicate entries risk double posting in settlement and reporting.")
    if f.dimension == "Timeliness":
        return (f"Check the source clock/timezone for {col} and re-verify out-of-window records",
                f"{_fmt_int(f.violations)} timestamps are future-dated or outside the freshness window.")
    if f.dimension == "Accuracy":
        return (f"Review implausible {col} values against the source ledger",
                f"{_fmt_int(f.violations)} values are outside the plausible range.")
    return (f"Enforce the {col} dependency as a schema constraint",
            f"{_fmt_int(f.violations)} rows break '{f.description}'.")


def score(md: ExtractedMetadata, profile: Optional[str] = None) -> DQSReport:
    profile = profile or ("payments" if md.dataset.detected_domain == "Payments" else "generic")
    base_weights = WEIGHT_PROFILES[profile]
    evidence = _collect_evidence(md)
    sensitive_cols = md.compliance_flags.sensitive_columns or {}

    raw: Dict[str, Tuple[Optional[float], int, int]] = {d: _score(d, evidence.get(d, [])) for d in DIMENSIONS}
    applicable = [d for d in DIMENSIONS if raw[d][0] is not None]
    weight_sum = sum(base_weights[d] for d in applicable)
    eff_weight = {d: (base_weights[d] / weight_sum if d in applicable and weight_sum else 0.0) for d in DIMENSIONS}
    composite = sum(eff_weight[d] * raw[d][0] for d in applicable) if applicable else 0.0

    # Regulations cited by rules that actually fired take precedence over the static mapping.
    rule_regulations: Dict[Tuple[str, str], str] = {}
    if md.rule_evaluation:
        for r in md.rule_evaluation.rules:
            if r.status == "applied" and r.violations > 0 and r.regulation:
                key = (r.dimension, r.column)
                rule_regulations[key] = "; ".join(dict.fromkeys(filter(None, [rule_regulations.get(key), r.regulation])))

    # Findings: one per evidence item with violations, ranked by composite points lost.
    findings: List[Finding] = []
    for d in applicable:
        _, checked_total, _ = raw[d]
        items = evidence[d]
        worst_ratio = max(i.violation_ratio for i in items)
        for item in items:
            if item.violations <= 0:
                continue
            if d == "Uniqueness":
                impact = eff_weight[d] * item.violation_ratio if item.violation_ratio == worst_ratio else 0.0
            else:
                impact = eff_weight[d] * item.violations / checked_total
            sens = sensitive_cols.get(item.column, [])
            findings.append(Finding(
                id="",
                dimension=d,
                columns=[item.column],
                check=item.check,
                description=item.description,
                violations=item.violations,
                checked=item.checked,
                violation_ratio=item.violation_ratio,
                severity=_severity(item.violation_ratio, sens, d),
                impact=round(impact, 6),
                regulatory_context=rule_regulations.get((d, item.column)) or _regulatory_context(d, sens),
            ))
    findings.sort(key=lambda f: (SEVERITY_PRIORITY[f.severity], -f.impact))
    for i, f in enumerate(findings, 1):
        f.id = f"F{i}"

    dimensions: List[DimensionResult] = []
    issues: List[DQIssue] = []
    for d in DIMENSIONS:
        s, checked, violations = raw[d]
        items = evidence.get(d, [])
        if s is None:
            reason = NOT_APPLICABLE_REASONS[d]
            dimensions.append(DimensionResult(
                dimension=d, applicable=False, score=None, weight=0.0, base_weight=base_weights[d],
                reason=reason, formula=FORMULAS[d],
                explanation=f"{d} was not scored: {reason}. Its weight is redistributed across the scored dimensions.",
            ))
            continue
        affected = [i.column for i in items if i.violations > 0]
        worst = max(items, key=lambda i: i.violation_ratio)
        if d == "Uniqueness":
            calc = f"{d} = {s:.3f} (1 − worst duplicate ratio {_pct(worst.violation_ratio)})"
        else:
            calc = f"{d} = {s:.3f} (1 − {_fmt_int(violations)} ÷ {_fmt_int(checked)})"
        if affected:
            detail = (f" {len(affected)} of {len(items)} assessed column{'s' if len(items) != 1 else ''} {'have' if len(affected) != 1 else 'has'} violations; the worst is {worst.column}: "
                      f"{_fmt_int(worst.violations)} of {_fmt_int(worst.checked)} ({_pct(worst.violation_ratio)}) fail '{worst.description}'.")
            issue = DQIssue(dimension=d, issue=f"{_fmt_int(worst.violations)} of {_fmt_int(worst.checked)} values in {worst.column} fail: {worst.description}",
                            affected_columns=affected, description=calc + "." + detail)
        else:
            detail = " The assessed column passes." if len(items) == 1 else f" All {len(items)} assessed columns pass."
            issue = DQIssue(dimension=d, description=calc + "." + detail)
        dimensions.append(DimensionResult(
            dimension=d, applicable=True, score=round(s, 4), weight=round(eff_weight[d], 4), base_weight=base_weights[d],
            reason=f"scored from {len(items)} check(s) over {', '.join(dict.fromkeys(i.column for i in items))}",
            formula=FORMULAS[d], checked=checked, violations=violations, affected_columns=affected,
            evidence=items, explanation=calc + "." + detail,
        ))
        issues.append(issue)

    actions: List[RemediationAction] = []
    for f in findings:
        action, why = _remediation(f, sensitive_cols.get(f.columns[0], []))
        actions.append(RemediationAction(
            action=action, priority=SEVERITY_PRIORITY[f.severity], description=why, dimension=f.dimension,
            finding_ids=[f.id], severity=f.severity, expected_gain=round(f.impact, 4),
        ))

    risks: List[str] = list(md.compliance_flags.prohibited_data or [])
    for f in findings:
        if f.regulatory_context and f.severity in ("high", "critical"):
            risks.append(f"{f.regulatory_context}: {f.columns[0]} — {_fmt_int(f.violations)} of {_fmt_int(f.checked)} values ({_pct(f.violation_ratio)}) fail {f.dimension.lower()} checks.")
    risks = list(dict.fromkeys(risks))

    scored = [d for d in dimensions if d.applicable]
    losses = sorted(((d.weight * (1 - d.score), d) for d in scored), key=lambda x: -x[0])
    top = [f"{d.dimension} (−{loss:.3f})" for loss, d in losses if loss > 0][:3]
    summary = (
        f"Composite DQS {composite:.3f}, grade {grade(composite)}, using the {profile} weight profile over "
        f"{_fmt_int(md.dataset.row_count)} rows and {md.dataset.column_count} columns. "
        f"{len(scored)} of {len(DIMENSIONS)} dimensions were applicable."
    )
    summary += f" Largest composite losses: {', '.join(top)}." if top else " No dimension lost points."
    if actions:
        summary += f" Top priority: {actions[0].action.lower()} ({findings[0].id})."

    rules_summary = {}
    if md.rule_evaluation:
        re_ = md.rule_evaluation
        applied_rules = [r for r in re_.rules if r.status == "applied"]
        held_rules = [r for r in re_.rules if r.status == "held"]
        by_source: Dict[str, int] = defaultdict(int)
        for r in applied_rules:
            by_source[r.source] += 1
        # Full rule definitions (params included) so a reviewer can export and approve a rule set.
        fields = ("id", "source", "dimension", "type", "column", "params", "description", "rationale",
                  "regulation", "citations", "approved", "checked", "violations", "violation_ratio")
        rules_summary = {
            "jurisdiction": re_.jurisdiction,
            "rule_mode": re_.rule_mode,
            "optional_columns": re_.optional_columns,
            "freshness_days": re_.freshness_days,
            "applied_by_source": dict(by_source),
            "rejected": [r.model_dump() for r in re_.rejected],
            "applied": [{k: getattr(r, k) for k in fields} for r in applied_rules],
            "held": [{**{k: getattr(r, k) for k in fields}, "hold_reason": r.hold_reason} for r in held_rules],
            "derivation": re_.derivation,
        }

    governance = md.governance.model_dump() if md.governance else {}
    governance.update({"scoring": f"deterministic engine v{ENGINE_VERSION}; no LLM involved in scores"})

    return DQSReport(
        report_version=REPORT_VERSION,
        engine_version=ENGINE_VERSION,
        scoring_profile=profile,
        composite_dqs=round(composite, 4),
        grade=grade(composite),
        dimension_scores={d.dimension: d.score for d in scored},
        dimensions=dimensions,
        findings=findings,
        data_quality_issues=issues,
        remediation_actions=actions,
        regulatory_compliance_risks=risks,
        executive_summary=summary,
        narrative_source="template",
        rules=rules_summary,
        governance=governance,
        metadata_fingerprint=fingerprint(md),
        dataset=md.dataset.model_dump(mode="json"),
    )
