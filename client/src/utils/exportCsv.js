const cell = (v) => {
  let text = Array.isArray(v) ? v.join("; ") : v ?? "";
  text = String(text);
  // Guard against spreadsheet formula injection from dataset-derived strings.
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");

export const findingsToCsv = (report) =>
  toCsv(
    ["id", "dimension", "severity", "columns", "check", "description", "violations", "checked", "violation_ratio", "impact", "regulatory_context"],
    (report.findings || []).map((f) => [
      f.id, f.dimension, f.severity, f.columns, f.check, f.description,
      f.violations, f.checked, f.violation_ratio, f.impact, f.regulatory_context,
    ])
  );

export const downloadText = (filename, text, type = "text/csv") => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
