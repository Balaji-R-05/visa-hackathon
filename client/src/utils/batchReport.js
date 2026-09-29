// Builds an aggregate report from the per-batch reports of a finished batch run.
// Everything here is computed from the batch reports; nothing is re-derived by an LLM.
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const pct = (x, d = 1) => (x == null || Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(d)}%`);
const fmt = (n) => Number(n).toLocaleString();
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const table = (header, rows) => [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const std = (xs) => (xs.length > 1 ? Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2))) : 0);

export function aggregateBatches(run) {
  const batches = run.batches;
  const done = batches.filter((b) => b.status === "done" && b.report);
  const failed = batches.filter((b) => b.status === "failed");
  const rows = done.reduce((s, b) => s + b.rows, 0);
  const wmean = (pick) => {
    const items = done.map((b) => [pick(b.report), b.rows]).filter(([v]) => v != null);
    const w = items.reduce((s, [, r]) => s + r, 0);
    return w ? items.reduce((s, [v, r]) => s + v * r, 0) / w : null;
  };

  const scores = done.map((b) => b.report.composite_dqs);
  const composite = wmean((r) => r.composite_dqs);

  // Dimensions: row-weighted mean over batches where the dimension applied.
  const dimNames = [...new Set(done.flatMap((b) => (b.report.dimensions || []).map((d) => d.dimension)))];
  const dimensions = dimNames.map((name) => {
    const per = done
      .map((b) => ({ b, d: (b.report.dimensions || []).find((x) => x.dimension === name) }))
      .filter(({ d }) => d?.applicable && d.score != null);
    const w = per.reduce((s, { b }) => s + b.rows, 0);
    const worst = per.length ? per.reduce((m, x) => (x.d.score < m.d.score ? x : m)) : null;
    return {
      name,
      mean: w ? per.reduce((s, { b, d }) => s + d.score * b.rows, 0) / w : null,
      min: per.length ? Math.min(...per.map((x) => x.d.score)) : null,
      max: per.length ? Math.max(...per.map((x) => x.d.score)) : null,
      applicableIn: per.length,
      worstBatch: worst?.b.index ?? null,
    };
  });

  // Findings: same dimension + check + columns across batches are one finding.
  const map = new Map();
  for (const b of done) {
    for (const f of b.report.findings || []) {
      const key = `${f.dimension}|${f.check}|${(f.columns || []).join(",")}`;
      const g = map.get(key) || { ...f, violations: 0, checked: 0, batches: [], severity: f.severity, worst: { ratio: -1, batch: null } };
      g.violations += f.violations || 0;
      g.checked += f.checked || 0;
      g.batches.push(b.index);
      if ((SEVERITY_RANK[f.severity] || 0) > (SEVERITY_RANK[g.severity] || 0)) g.severity = f.severity;
      if ((f.violation_ratio || 0) > g.worst.ratio) g.worst = { ratio: f.violation_ratio || 0, batch: b.index };
      map.set(key, g);
    }
  }
  const findings = [...map.values()]
    .map((g) => ({ ...g, ratio: g.checked ? g.violations / g.checked : 0 }))
    .sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0) || b.ratio - a.ratio);

  const actions = new Map();
  for (const b of done) {
    const byId = Object.fromEntries((b.report.findings || []).map((f) => [f.id, f]));
    for (const a of b.report.remediation_actions || []) {
      const g = actions.get(a.action) || { ...a, batches: 0, violations: 0, gain: 0 };
      g.batches += 1;
      g.priority = Math.min(g.priority ?? 99, a.priority ?? 99);
      g.gain += a.expected_gain || 0;
      for (const id of a.finding_ids || []) g.violations += byId[id]?.violations || 0;
      actions.set(a.action, g);
    }
  }
  const remediation = [...actions.values()].sort((a, b) => a.priority - b.priority || b.gain - a.gain);

  const risks = new Map();
  for (const b of done) for (const r of b.report.regulatory_compliance_risks || []) risks.set(r, (risks.get(r) || 0) + 1);

  return { done, failed, rows, composite, scores, dimensions, findings, remediation, risks: [...risks.entries()] };
}

export function batchReportMarkdown(run) {
  const a = aggregateBatches(run);
  const first = a.done[0]?.report;
  const severityCounts = a.findings.reduce((c, f) => ({ ...c, [f.severity]: (c[f.severity] || 0) + 1 }), {});
  // estRows is only a guess from the first 512 KB, so it can over- or under-shoot the true count;
  // whether the whole file was actually covered is tracked directly by the run (see batchStore.js).
  const coverage = run.estRows ? Math.min(1, a.rows / run.estRows) : null;
  const stoppedEarly = run.exhausted === false;
  const out = [];

  out.push(`# Assay Batch Assessment Report: ${run.fileName}`);
  out.push(`Generated ${new Date().toLocaleString()} · engine ${first?.engine_version ?? "n/a"} · scoring profile ${first?.scoring_profile ?? "n/a"} · jurisdiction ${first?.rules?.jurisdiction ?? "n/a"} · rule mode ${first?.rules?.rule_mode ?? run.ruleMode ?? "n/a"}`);

  out.push("## 1. Summary");
  out.push(table(["Measure", "Value"], [
    ["Batches completed", `${a.done.length} of ${run.batches.length}${a.failed.length ? ` (${a.failed.length} failed)` : ""}`],
    ["Rows assessed", fmt(a.rows)],
    ["Estimated rows in file", run.estRows ? `~${fmt(run.estRows)}` : "n/a"],
    ["Coverage of file", run.exhausted ? "100% (all rows in the file were processed)" : stoppedEarly ? `${coverage == null ? "partial" : `~${pct(coverage, 0)}`} (run stopped or limited before the end of the file)` : coverage == null ? "n/a" : `~${pct(coverage, 0)} (estimate; row count is approximate)`],
    ["Composite score (row-weighted mean)", pct(a.composite)],
    ["Batch score range", a.scores.length ? `${pct(Math.min(...a.scores))} to ${pct(Math.max(...a.scores))}` : "n/a"],
    ["Batch score std. deviation", a.scores.length ? pct(std(a.scores), 2) : "n/a"],
    ["Distinct findings", `${a.findings.length} (${["critical", "high", "medium", "low"].filter((s) => severityCounts[s]).map((s) => `${severityCounts[s]} ${s}`).join(", ") || "none"})`],
  ]));

  out.push("## 2. Score by batch");
  out.push(table(["Batch", "File", "Rows", "Composite", "Grade", "Status"], run.batches.map((b) => [
    b.index, b.name, fmt(b.rows), b.report ? pct(b.report.composite_dqs) : "n/a", b.report?.grade ?? "n/a", b.status === "failed" ? `failed: ${b.error}` : b.status,
  ])));

  out.push("## 3. Dimension scores across batches");
  out.push("Row-weighted mean over the batches in which the dimension applied to the data.");
  out.push(table(["Dimension", "Mean", "Min", "Max", "Batches scored", "Weakest batch"], a.dimensions.map((d) => [
    d.name, pct(d.mean), pct(d.min), pct(d.max), `${d.applicableIn}/${a.done.length}`, d.worstBatch ?? "n/a",
  ])));

  out.push("## 4. Findings (combined across batches)");
  if (a.findings.length) {
    out.push(table(["Severity", "Dimension", "Columns", "Check", "Violations", "Checked", "Ratio", "Batches", "Worst batch"], a.findings.slice(0, 40).map((f) => [
      f.severity, f.dimension, (f.columns || []).join(", "), f.check, fmt(f.violations), fmt(f.checked), pct(f.ratio, 2), `${f.batches.length}/${a.done.length}`, f.worst.batch,
    ])));
    if (a.findings.length > 40) out.push(`_Showing 40 of ${a.findings.length} findings; the full list is in the JSON export._`);
    out.push("### Descriptions of the most severe findings");
    out.push(a.findings.slice(0, 10).map((f) => `- **${f.dimension}: ${(f.columns || []).join(", ")}** (${f.severity}). ${f.description}${f.regulatory_context ? ` _Context: ${f.regulatory_context}_` : ""}`).join("\n"));
  } else out.push("No findings were reported.");

  out.push("## 5. Regulatory context");
  out.push(a.risks.length
    ? a.risks.slice(0, 30).map(([r, n]) => `- ${r}${a.done.length > 1 ? ` _(reported in ${n} of ${a.done.length} batches)_` : ""}`).join("\n")
    : "None reported.");

  out.push("## 6. Recommended actions");
  out.push(a.remediation.length
    ? table(["Priority", "Action", "Dimension", "Violations addressed", "Est. composite gain if fixed", "Batches"], a.remediation.slice(0, 15).map((r) => [r.priority, r.action, r.dimension ?? "", fmt(r.violations), `+${(r.gain * 100).toFixed(2)} pts`, `${r.batches}/${a.done.length}`]))
    : "None reported.");

  if (a.failed.length) {
    out.push("## 7. Failed batches");
    out.push(a.failed.map((b) => `- Batch ${b.index} (${b.name}, ${fmt(b.rows)} rows): ${b.error}`).join("\n"));
  }

  out.push("## Method and limitations");
  out.push([
    "- The file was split in the browser into independent CSV batches; each was profiled, rule-checked and scored on its own, and the numbers above are combined from those batch reports.",
    "- **Cross-batch effects are not detected.** A value that is unique inside each batch but duplicated across batches is not reported by Uniqueness, and cross-batch consistency is not checked.",
    "- The composite is the mean of batch composites weighted by rows, which approximates but is not identical to scoring the whole file in one pass.",
    "- LLM narratives were disabled for batch runs. Scores, findings and rules are deterministic; recommended actions are the scoring engine's template actions (one per finding) and regulatory context comes from each batch report. Estimated composite gain is summed across batches, so treat it as an indicator, not an exact figure.",
    "- Raw rows never left the data-plane; only aggregate metadata was used downstream.",
  ].join("\n"));

  out.push("## Appendix: audit trail per batch");
  out.push("Each batch was written to the hash-chained audit log; verify integrity with `GET /api/audit/verify`.");
  out.push(table(["Batch", "Audit ID", "Metadata fingerprint"], a.done.map((b) => [b.index, b.report.audit_id ?? "n/a", b.report.metadata_fingerprint ?? "n/a"])));

  return out.join("\n\n") + "\n";
}

export function batchReportJson(run) {
  const a = aggregateBatches(run);
  return JSON.stringify({
    file: run.fileName,
    generated_at: new Date().toISOString(),
    rows_assessed: a.rows,
    estimated_rows: run.estRows || null,
    composite_row_weighted: a.composite,
    batches: run.batches.map((b) => ({ index: b.index, name: b.name, rows: b.rows, status: b.status, error: b.error, composite_dqs: b.report?.composite_dqs, grade: b.report?.grade, audit_id: b.report?.audit_id, metadata_fingerprint: b.report?.metadata_fingerprint })),
    dimensions: a.dimensions,
    findings: a.findings.map(({ batches, worst, ...f }) => ({ ...f, batches, worst_batch: worst.batch })),
    remediation_actions: a.remediation,
    regulatory_context: a.risks.map(([text, batches]) => ({ text, batches })),
  }, null, 2);
}
