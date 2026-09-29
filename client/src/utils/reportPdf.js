import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { pdfSafe, pdfSafeRows } from "./pdfText.js";

const INK = [15, 15, 20];
const MUTED = [100, 105, 120];
const INDIGO = [79, 70, 229];
const LINE = [225, 225, 232];
const SEVERITY_COLOR = { critical: [220, 38, 38], high: [234, 88, 12], medium: [217, 119, 6], low: [100, 105, 120] };
const pct = (x, d = 1) => (x == null || Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(d)}%`);
const fmt = (n) => Number(n ?? 0).toLocaleString();

// A single assessment report (CSV/Postgres/Mongo/API), laid out the same way as the batch PDF.
export function reportPdf(r) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 0;

  const ensure = (h) => { if (y + h > doc.internal.pageSize.getHeight() - 50) { doc.addPage(); header(true); } };
  const header = (continued = false) => {
    doc.setFillColor(...INK); doc.rect(0, 0, pageW, 46, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("Assay", margin, 29);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(200, 200, 210);
    doc.text(pdfSafe(continued ? `${r.dataset?.dataset_name || "dataset"} (continued)` : (r.dataset?.dataset_name || "dataset")), pageW - margin, 29, { align: "right" });
    y = 68;
  };
  const footer = () => {
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text(`Assay data quality report · page ${i} of ${pages}`, margin, doc.internal.pageSize.getHeight() - 22);
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

  const findings = [...(r.findings || [])].sort((a, b) => (b.impact || 0) - (a.impact || 0));
  const actions = [...(r.remediation_actions || [])].sort((a, b) => a.priority - b.priority || (b.expected_gain || 0) - (a.expected_gain || 0));

  header();
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...INK);
  doc.text("Data Quality Report", margin, y); y += 20;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text(pdfSafe(r.dataset?.dataset_name || "dataset"), margin, y); y += 14;
  doc.setFontSize(8.5);
  doc.text(
    `Generated ${new Date().toLocaleString()}  ·  engine ${r.engine_version ?? "n/a"}  ·  profile ${r.scoring_profile ?? "n/a"}  ·  jurisdiction ${r.rules?.jurisdiction ?? "n/a"}  ·  rule mode ${r.rules?.rule_mode ?? "n/a"}`,
    margin, y
  );
  y += 24;

  doc.setDrawColor(...LINE); doc.setFillColor(250, 250, 252); doc.roundedRect(margin, y, pageW - margin * 2, 60, 6, 6, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(26); doc.setTextColor(...INDIGO);
  doc.text(pct(r.composite_dqs), margin + 18, y + 39);
  doc.setFontSize(9); doc.setTextColor(...MUTED); doc.setFont("helvetica", "normal");
  doc.text(pdfSafe(`Composite score · ${r.grade || ""}`), margin + 18, y + 52);
  const stats = [
    ["Rows", fmt(r.dataset?.row_count)],
    ["Columns", fmt(r.dataset?.column_count)],
    ["Findings", `${(r.findings || []).length}`],
  ];
  stats.forEach(([k, v], i) => {
    const x = margin + 250 + i * 100;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(pdfSafe(v), x, y + 30);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(pdfSafe(k), x, y + 44);
  });
  y += 80;

  if (r.executive_summary) {
    h2("Executive summary");
    p(r.executive_summary, { size: 9 });
  }

  h2("Dimension scores");
  table(["Dimension", "Score", "Weight", "Applicable", "Reason"], (r.dimensions || []).map((d) => [
    d.dimension, d.applicable ? pct(d.score) : "n/a", pct(d.weight, 0), d.applicable ? "yes" : "no", d.reason || "",
  ]), { columnStyles: { 4: { cellWidth: 190 } } });

  h2("Findings");
  if (findings.length) {
    table(["Sev.", "Dimension", "Columns", "Violations", "Checked", "Ratio"], findings.slice(0, 30).map((f) => [
      f.severity, f.dimension, (f.columns || []).join(", "), fmt(f.violations), fmt(f.checked), pct(f.violation_ratio, 2),
    ]));
    findings.slice(0, 10).forEach((f) => {
      const c = SEVERITY_COLOR[f.severity] || MUTED;
      p(`${f.dimension} — ${(f.columns || []).join(", ")}  [${f.severity}]`, { bold: true, size: 9, color: c, gap: 2 });
      p(f.description + (f.regulatory_context ? `  Context: ${f.regulatory_context}` : ""), { size: 8.5, color: MUTED, gap: 8 });
    });
  } else p("No findings were reported.");

  h2("Recommended actions");
  if (actions.length) {
    table(["Pri.", "Action", "Dimension", "Est. gain"], actions.slice(0, 15).map((a) => [
      a.priority, a.action, a.dimension || "", a.expected_gain != null ? `+${(a.expected_gain * 100).toFixed(2)} pts` : "",
    ]), { columnStyles: { 1: { cellWidth: 260 } } });
  } else p("None reported.");

  if (r.regulatory_compliance_risks?.length) {
    h2("Regulatory context");
    p(r.regulatory_compliance_risks.slice(0, 15).map((t) => `• ${t}`).join("\n"), { size: 8.5 });
  }

  if (r.rules) {
    h2("Rules applied");
    p(`Jurisdiction ${r.rules.jurisdiction || "n/a"} · rule mode ${r.rules.rule_mode || "n/a"} · ${Object.entries(r.rules.applied_by_source || {}).map(([k, v]) => `${v} ${k}`).join(", ") || "n/a"}.`, { size: 8.5, color: MUTED });
  }

  h2("Governance and audit");
  p(`Narrative source: ${r.narrative_source || "n/a"}${r.narrative_model ? ` (${r.narrative_model})` : ""}.`, { size: 8.5, color: MUTED, gap: 3 });
  p(`Audit ID: ${r.audit_id || "n/a"}`, { size: 8.5, color: MUTED, gap: 3 });
  p(`Metadata fingerprint: ${r.metadata_fingerprint || "n/a"}`, { size: 8.5, color: MUTED, gap: 3 });
  p("Verify this assessment's place in the tamper-evident audit log with GET /api/audit/verify.", { size: 8.5, color: MUTED });

  footer();
  return doc;
}

export const downloadReportPdf = (r) => {
  reportPdf(r).save(`Assay_Report_${(r.dataset?.dataset_name || "dataset").replace(/[^\w.-]+/g, "_")}.pdf`);
};
