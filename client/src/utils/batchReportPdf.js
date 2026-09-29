import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { aggregateBatches } from "./batchReport.js";
import { pdfSafe, pdfSafeRows } from "./pdfText.js";

const INK = [15, 15, 20];
const MUTED = [100, 105, 120];
const INDIGO = [79, 70, 229];
const LINE = [225, 225, 232];
const pct = (x, d = 1) => (x == null || Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(d)}%`);
const fmt = (n) => Number(n).toLocaleString();

// Builds the same content as the Markdown/JSON report, laid out as a printable PDF.
export function batchReportPdf(run) {
  const a = aggregateBatches(run);
  const first = a.done[0]?.report;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 0;

  const ensure = (h) => {
    if (y + h > doc.internal.pageSize.getHeight() - 50) { doc.addPage(); header(true); }
  };
  const header = (continued = false) => {
    doc.setFillColor(...INK); doc.rect(0, 0, pageW, 46, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("Assay", margin, 29);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(200, 200, 210);
    doc.text(pdfSafe(continued ? `${run.fileName} (continued)` : run.fileName), pageW - margin, 29, { align: "right" });
    y = 68;
  };
  const footer = () => {
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text(`Assay batch assessment report · page ${i} of ${pages}`, margin, doc.internal.pageSize.getHeight() - 22);
    }
  };
  const h2 = (text) => {
    ensure(30);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...INK);
    doc.text(text, margin, y);
    doc.setDrawColor(...INDIGO); doc.setLineWidth(1.4); doc.line(margin, y + 5, margin + 26, y + 5);
    y += 20;
  };
  const p = (text, opts = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal"); doc.setFontSize(opts.size || 9.5);
    doc.setTextColor(...(opts.color || INK));
    const lines = doc.splitTextToSize(pdfSafe(text), pageW - margin * 2);
    ensure(lines.length * 13 + 4);
    doc.text(lines, margin, y);
    y += lines.length * 13 + (opts.gap ?? 6);
  };
  const table = (head, rows, opts = {}) => {
    autoTable(doc, {
      startY: y, margin: { left: margin, right: margin }, head: [pdfSafeRows(head)], body: pdfSafeRows(rows),
      theme: "grid", styles: { fontSize: 8, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
      headStyles: { fillColor: INDIGO, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 246, 250] },
      // autoTable calls this for every page it spans, including the current one (page 1 the
      // first time a table is drawn) — only re-draw the header as "(continued)" on later pages.
      didDrawPage: () => header(doc.internal.getCurrentPageInfo().pageNumber > 1),
      ...opts,
    });
    y = doc.lastAutoTable.finalY + 18;
  };

  header();
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...INK);
  doc.text("Batch Assessment Report", margin, y); y += 20;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text(pdfSafe(run.fileName), margin, y); y += 14;
  doc.setFontSize(8.5);
  doc.text(
    pdfSafe(`Generated ${new Date().toLocaleString()}  -  engine ${first?.engine_version ?? "n/a"}  -  profile ${first?.scoring_profile ?? "n/a"}  -  jurisdiction ${first?.rules?.jurisdiction ?? "n/a"}  -  rule mode ${first?.rules?.rule_mode ?? run.ruleMode ?? "n/a"}`),
    margin, y
  );
  y += 24;

  // Composite score badge
  const severityCounts = a.findings.reduce((c, f) => ({ ...c, [f.severity]: (c[f.severity] || 0) + 1 }), {});
  doc.setDrawColor(...LINE); doc.setFillColor(250, 250, 252); doc.roundedRect(margin, y, pageW - margin * 2, 60, 6, 6, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(26); doc.setTextColor(...INDIGO);
  doc.text(pct(a.composite), margin + 18, y + 39);
  doc.setFontSize(9); doc.setTextColor(...MUTED); doc.setFont("helvetica", "normal");
  doc.text("Composite score, row-weighted", margin + 18, y + 52);
  const stats = [
    ["Batches", `${a.done.length} of ${run.batches.length}${a.failed.length ? ` (${a.failed.length} failed)` : ""}`],
    ["Rows assessed", fmt(a.rows)],
    ["Findings", `${a.findings.length}`],
  ];
  stats.forEach(([k, v], i) => {
    const x = margin + 250 + i * 100;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(pdfSafe(v), x, y + 30);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(pdfSafe(k), x, y + 44);
  });
  y += 80;

  h2("1. Summary");
  table(["Measure", "Value"], [
    ["Grade", first?.grade ?? "n/a"],
    ["Rows assessed", fmt(a.rows)],
    ["Estimated rows in file", run.estRows ? `~${fmt(run.estRows)}` : "n/a"],
    ["Coverage", run.exhausted ? "100% (whole file processed)" : run.exhausted === false ? "Partial (run stopped or limited)" : "n/a"],
    ["Batch score range", a.scores.length ? `${pct(Math.min(...a.scores))} – ${pct(Math.max(...a.scores))}` : "n/a"],
    ["Findings by severity", ["critical", "high", "medium", "low"].filter((s) => severityCounts[s]).map((s) => `${severityCounts[s]} ${s}`).join(", ") || "none"],
  ], { columnStyles: { 0: { cellWidth: 160 } } });

  h2("2. Score by batch");
  table(["#", "File", "Rows", "Score", "Grade", "Status"], run.batches.map((b) => [
    b.index, b.name, fmt(b.rows), b.report ? pct(b.report.composite_dqs) : "-", b.report?.grade ?? "-", b.status === "failed" ? "failed" : b.status,
  ]), { columnStyles: { 1: { cellWidth: 210 } } });

  h2("3. Dimension scores");
  table(["Dimension", "Mean", "Min", "Max", "Scored in", "Weakest batch"], a.dimensions.map((d) => [
    d.name, pct(d.mean), pct(d.min), pct(d.max), `${d.applicableIn}/${a.done.length}`, d.worstBatch ?? "-",
  ]));

  h2("4. Findings (combined across batches)");
  if (a.findings.length) {
    table(["Sev.", "Dimension", "Columns", "Violations", "Ratio", "Batches"], a.findings.slice(0, 30).map((f) => [
      f.severity, f.dimension, (f.columns || []).join(", "), fmt(f.violations), pct(f.ratio, 2), `${f.batches.length}/${a.done.length}`,
    ]));
    a.findings.slice(0, 8).forEach((f) => {
      p(`${f.dimension} — ${(f.columns || []).join(", ")} (${f.severity})`, { bold: true, size: 9, gap: 2 });
      p(f.description + (f.regulatory_context ? `  Context: ${f.regulatory_context}` : ""), { size: 8.5, color: MUTED, gap: 8 });
    });
  } else p("No findings were reported.");

  h2("5. Recommended actions");
  if (a.remediation.length) {
    table(["Pri.", "Action", "Dimension", "Est. gain", "Batches"], a.remediation.slice(0, 15).map((r) => [
      r.priority, r.action, r.dimension ?? "", `+${(r.gain * 100).toFixed(2)} pts`, `${r.batches}/${a.done.length}`,
    ]), { columnStyles: { 1: { cellWidth: 220 } } });
  } else p("None reported.");

  h2("6. Regulatory context");
  p(a.risks.length ? a.risks.slice(0, 15).map(([r]) => `• ${r}`).join("\n") : "None reported.", { size: 8.5 });

  if (a.failed.length) {
    h2("7. Failed batches");
    a.failed.forEach((b) => p(`Batch ${b.index} (${b.name}, ${fmt(b.rows)} rows): ${b.error}`, { size: 8.5, color: MUTED, gap: 3 }));
  }

  h2("Method and limitations");
  [
    "The file was split in the browser into independent CSV batches; each was profiled, rule-checked and scored on its own, and this report combines those batch reports.",
    "Cross-batch effects are not detected: a value unique inside each batch but duplicated across batches is not reported by Uniqueness, and cross-batch consistency is not checked.",
    "The composite score is the row-weighted mean of batch composites, which approximates but is not identical to scoring the whole file in one pass.",
    "LLM narratives were disabled for batch runs; scores, findings and rules are deterministic, and recommended actions are the scoring engine's template actions.",
    "Raw rows never left the data-plane; only aggregate metadata was used downstream.",
  ].forEach((t) => p(`•  ${t}`, { size: 8.5, color: MUTED, gap: 5 }));

  h2("Appendix: audit trail per batch");
  p("Each batch was written to the hash-chained audit log; verify integrity with GET /api/audit/verify.", { size: 8.5, color: MUTED });
  table(["#", "Audit ID", "Metadata fingerprint"], a.done.map((b) => [b.index, b.report.audit_id ?? "n/a", b.report.metadata_fingerprint ?? "n/a"]), {
    styles: { fontSize: 6.5, cellPadding: 3 },
  });

  footer();
  return doc;
}

export const downloadBatchReportPdf = (run) => {
  batchReportPdf(run).save(`Assay_Batch_Report_${run.fileName.replace(/\.csv$/i, "")}.pdf`);
};
