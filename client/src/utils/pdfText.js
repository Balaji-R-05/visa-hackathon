// jsPDF's built-in fonts (Helvetica) only cover WinAnsi, not full Unicode. An unsupported
// glyph (a non-breaking hyphen, a minus sign, a multiplication sign, …) doesn't just render
// as a blank box — it can throw off jsPDF's width calculation for the rest of the line,
// which shows up as garbled, over-spaced or truncated text. Report text (LLM narratives,
// engine descriptions with formulas) uses several such characters, so every string handed
// to jsPDF is normalised to a WinAnsi-safe equivalent first.
const REPLACEMENTS = {
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-",
  "‘": "'", "’": "'", "‚": "'", "“": '"', "”": '"', "„": '"',
  "−": "-", "×": "x", "÷": "/", "≤": "<=", "≥": ">=",
  "±": "+/-", "…": "...", "•": "-", " ": " ",
};
const PATTERN = new RegExp(`[${Object.keys(REPLACEMENTS).join("")}]`, "g");

export const pdfSafe = (value) => {
  if (value == null) return value;
  const text = String(value).replace(PATTERN, (c) => REPLACEMENTS[c]);
  // Anything still outside WinAnsi's printable range (rare: emoji, other scripts) is dropped
  // rather than left to corrupt the line.
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x00-\xFF]/g, "");
};

/** Deep-sanitises an array of row arrays (for autoTable body/head) or a plain array of strings. */
export const pdfSafeRows = (rows) => rows.map((row) => (Array.isArray(row) ? row.map(pdfSafe) : pdfSafe(row)));
