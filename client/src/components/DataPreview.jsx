import { useEffect, useMemo, useState } from "react";
import { Table2, AlertCircle } from "lucide-react";

const SLICE_BYTES = 512 * 1024;
const PREVIEW_ROWS = 10;

// Minimal RFC-4180 parser (quotes, escaped quotes, CRLF). Runs entirely in the browser.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function inferType(values) {
  const v = values.filter((x) => x !== "");
  if (!v.length) return "empty";
  if (v.every((x) => /^-?\d+$/.test(x))) return "integer";
  if (v.every((x) => /^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(x))) return "number";
  if (v.every((x) => /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/.test(x))) return "date";
  if (v.every((x) => /^(true|false|yes|no|0|1)$/i.test(x))) return "boolean";
  return "text";
}

const TYPE_STYLE = {
  integer: "text-sky-300 bg-sky-500/10", number: "text-sky-300 bg-sky-500/10",
  date: "text-amber-300 bg-amber-500/10", boolean: "text-violet-300 bg-violet-500/10",
  text: "text-slate-300 bg-white/5", empty: "text-slate-500 bg-white/5",
};

export default function DataPreview({ file }) {
  const [state, setState] = useState({ rows: null, truncated: false, error: "" });

  useEffect(() => {
    let cancelled = false;
    setState({ rows: null, truncated: false, error: "" });
    if (!file) return;
    const truncated = file.size > SLICE_BYTES;
    file.slice(0, SLICE_BYTES).text()
      .then((text) => {
        if (cancelled) return;
        let rows = parseCsv(text);
        if (truncated) rows = rows.slice(0, -1); // last row may be cut mid-line
        setState({ rows, truncated, error: "" });
      })
      .catch(() => !cancelled && setState({ rows: null, truncated: false, error: "Could not read this file." }));
    return () => { cancelled = true; };
  }, [file]);

  const summary = useMemo(() => {
    const { rows, truncated } = state;
    if (!rows || rows.length < 2) return null;
    const [header, ...data] = rows;
    const cols = header.map((name, i) => {
      const values = data.map((r) => (r[i] ?? "").trim());
      const blanks = values.filter((v) => v === "").length;
      return { name: name || `column_${i + 1}`, type: inferType(values), nullPct: values.length ? (blanks / values.length) * 100 : 0 };
    });
    const avgBytes = SLICE_BYTES / Math.max(rows.length, 1);
    const rowCount = truncated ? Math.round(file.size / avgBytes) - 1 : data.length;
    return { cols, data: data.slice(0, PREVIEW_ROWS), rowCount, truncated };
  }, [state, file]);

  if (!file) return null;

  return (
    <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.02] p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Table2 className="size-5 text-indigo-400" />
          <span className="font-bold text-sm uppercase tracking-wider">Data preview</span>
        </div>
        {summary && (
          <div className="flex gap-2 text-xs text-slate-400">
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">{summary.truncated ? "~" : ""}{summary.rowCount.toLocaleString()} rows</span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">{summary.cols.length} columns</span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
        )}
      </div>

      {state.error && <p className="flex items-center gap-2 text-sm text-red-400"><AlertCircle className="size-4" />{state.error}</p>}
      {!state.error && !state.rows && <p className="text-sm text-slate-500">Reading file…</p>}
      {state.rows && !summary && <p className="flex items-center gap-2 text-sm text-amber-300"><AlertCircle className="size-4" />No data rows found. Check that the file has a header and at least one row.</p>}

      {summary && (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/5 text-left">
                  <th className="px-3 py-2 text-slate-500 font-normal w-10">#</th>
                  {summary.cols.map((c) => (
                    <th key={c.name} className="px-3 py-2 whitespace-nowrap align-top">
                      <div className="font-semibold text-slate-100">{c.name}</div>
                      <div className="mt-1 flex items-center gap-1.5 font-normal">
                        <span className={`px-1.5 py-0.5 rounded ${TYPE_STYLE[c.type]}`}>{c.type}</span>
                        <span className={c.nullPct > 0 ? "text-amber-300" : "text-slate-500"}>{c.nullPct.toFixed(0)}% blank</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.data.map((r, i) => (
                  <tr key={i} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-3 py-1.5 text-slate-600">{i + 1}</td>
                    {summary.cols.map((c, j) => {
                      const v = r[j] ?? "";
                      return <td key={j} className="px-3 py-1.5 whitespace-nowrap max-w-56 truncate text-slate-300">{v === "" ? <span className="text-slate-600 italic">null</span> : v}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Showing the first {summary.data.length} rows{summary.truncated ? ", with types and blanks estimated from the first 512 KB" : ""}. This preview is generated in your browser; nothing is uploaded until you start the analysis.
          </p>
        </>
      )}
    </div>
  );
}
