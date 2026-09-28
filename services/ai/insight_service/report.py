from datetime import datetime, timezone
from common.schemas import DQSReport


def _pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def to_markdown(r: DQSReport) -> str:
    ds = r.dataset
    lines = [
        "# Data Quality Report",
        "",
        f"**Dataset**: {ds.get('dataset_name')} ({ds.get('source_type', 'unknown')}) · {ds.get('row_count', 0):,} rows · {ds.get('column_count', 0)} columns  ",
        f"**Composite DQS**: {r.composite_dqs:.3f} — grade {r.grade} ({r.scoring_profile} weights)  ",
        f"**Generated**: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · engine v{r.engine_version} · "
        f"narrative: {r.narrative_source}{f' ({r.narrative_model})' if r.narrative_model else ''}  ",
        f"**Metadata fingerprint**: `{r.metadata_fingerprint}`" + (f"  \n**Audit id**: `{r.audit_id}`" if r.audit_id else ""),
        "",
        "## Summary",
        "",
        r.executive_summary,
        "",
        "## Dimension scores",
        "",
        "| Dimension | Score | Weight | How it was computed |",
        "|---|---|---|---|",
    ]
    for d in r.dimensions:
        score = f"{d.score:.3f}" if d.score is not None else "not scored"
        how = d.explanation.replace("|", "\\|")
        lines.append(f"| {d.dimension} | {score} | {d.weight:.2f} | {how} |")

    if r.findings:
        lines += ["", "## Findings", "", "| Id | Severity | Dimension | Column | Violations | Rule |", "|---|---|---|---|---|---|"]
        for f in r.findings:
            lines.append(
                f"| {f.id} | {f.severity} | {f.dimension} | {f.columns[0]} | {f.violations:,} / {f.checked:,} ({_pct(f.violation_ratio)}) | {f.description.replace('|', '/')} |"
            )

    if r.remediation_actions:
        lines += ["", "## Improvement pathway", ""]
        for a in sorted(r.remediation_actions, key=lambda a: (a.priority, -(a.expected_gain or 0))):
            gain = f" · +{a.expected_gain:.3f} DQS if fixed" if a.expected_gain else ""
            lines.append(f"- **P{a.priority}** {a.action} ({', '.join(a.finding_ids)}{gain}) — {a.description}")

    lines += ["", "## Compliance and risk", ""]
    lines += [f"- {risk}" for risk in r.regulatory_compliance_risks] or ["- No regulatory risks identified."]

    rules = r.rules or {}
    if rules:
        lines += [
            "",
            "## Rules",
            "",
            f"Jurisdiction **{rules.get('jurisdiction')}**, mode **{rules.get('rule_mode')}**, applied by source: {rules.get('applied_by_source')}.",
        ]
        for rej in rules.get("rejected", []):
            rule = rej.get("rule", {})
            lines.append(f"- Rejected {rule.get('type')} on {rule.get('column')}: {rej.get('reason')}")

    if r.grounding:
        g = r.grounding
        lines += ["", "## Narrative grounding", "", f"{g.verified} of {g.numeric_claims} numeric claims verified against the engine output."]
        if g.unverified_claims:
            lines.append(f"Unverified: {', '.join(g.unverified_claims)}")

    gov = r.governance or {}
    lines += [
        "",
        "## Governance",
        "",
        f"- Raw values included in metadata: {gov.get('raw_values_included', False)}",
        f"- Scoring: {gov.get('scoring', 'deterministic')}",
        f"- LLM: {gov.get('llm_provider') or 'none'} (local: {gov.get('llm_local', 'n/a')})",
        f"- Suppressed value-level fields: {len(gov.get('suppressed_fields', []))}",
    ]
    return "\n".join(lines) + "\n"
