// Streams a large CSV from disk and yields it as independent CSV Blobs (header repeated),
// so each piece fits under the upload limit. Nothing is held in memory beyond one batch.
const READ_BLOCK = 8 * 1024 * 1024;
export const MAX_BATCH_CHARS = 40 * 1000 * 1000; // stays under the 50 MB upload cap even for multi-byte text

/** Estimates total data rows from the first block (used only for progress display). */
export const estimateRows = async (file) => {
  const sample = await file.slice(0, 512 * 1024).text();
  const lines = sample.split("\n").length - 1;
  if (lines < 2) return 0;
  return Math.max(0, Math.round(file.size / (sample.length / lines)) - 1);
};

/**
 * Async generator of { index, rows, blob }. A row only ends at a newline outside quotes,
 * so quoted multi-line fields are never split across batches.
 */
export async function* csvBatches(file, rowsPerBatch, skip = new Set()) {
  const decoder = new TextDecoder();
  let carry = "";
  let header = null;
  let batch = [];
  let chars = 0;
  let index = 0;
  let pendingRow = "";
  let inQuotes = false;

  const flush = () => {
    const i = ++index;
    // Batches already done in an earlier run are counted but not built, so a resume walks past them cheaply.
    const out = skip.has(i)
      ? { index: i, rows: batch.length, skipped: true }
      : { index: i, rows: batch.length, blob: new Blob([header, "\n", batch.join("\n"), "\n"], { type: "text/csv" }) };
    batch = [];
    chars = 0;
    return out;
  };

  const takeLine = (line) => {
    // Track quote parity: an odd number of quotes means the row continues on the next line.
    const quotes = (line.match(/"/g) || []).length;
    pendingRow = pendingRow ? `${pendingRow}\n${line}` : line;
    if (quotes % 2 === 1) inQuotes = !inQuotes;
    if (inQuotes) return null;
    const row = pendingRow;
    pendingRow = "";
    return row;
  };

  for (let offset = 0; offset < file.size; offset += READ_BLOCK) {
    const buf = await file.slice(offset, offset + READ_BLOCK).arrayBuffer();
    carry += decoder.decode(buf, { stream: offset + READ_BLOCK < file.size });
    const lines = carry.split("\n");
    carry = lines.pop();
    for (let line of lines) {
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const row = takeLine(line);
      if (row === null) continue;
      if (header === null) {
        header = row.replace(/^﻿/, "");
        continue;
      }
      if (row === "") continue;
      batch.push(row);
      chars += row.length + 1;
      if (batch.length >= rowsPerBatch || chars >= MAX_BATCH_CHARS) yield flush();
    }
  }
  if (carry) {
    const row = takeLine(carry.endsWith("\r") ? carry.slice(0, -1) : carry);
    if (row && header !== null) batch.push(row);
  }
  if (pendingRow && header !== null) batch.push(pendingRow);
  if (batch.length) yield flush();
}
