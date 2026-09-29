import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, ChevronRight, Download, FileText, Square, AlertTriangle } from "lucide-react";
import { toast } from "react-toastify";
import { fetchJob } from "../api/api.js";
import { stopBatchRun } from "../utils/batchStore.js";
import { downloadText } from "../utils/exportCsv.js";
import { batchReportJson, batchReportMarkdown } from "../utils/batchReport.js";
import { downloadBatchReportPdf } from "../utils/batchReportPdf.js";
import JobProgress from "./JobProgress.jsx";

const fmt = (n) => n.toLocaleString();
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const secs = (ms) => `${Math.round(ms / 1000)}s`;

// Live view of the shared batch run: overall bar, current stage, per-batch table and totals.
// `resumeSlot` is shown inside the "interrupted" notice (the CSV page passes its resume button).
export default function BatchProgress({ run, onOpen, resumeSlot }) {
  const { status, batches, job, estRows, rowsPerBatch, limit, fileName } = run;
  const running = status === "running" || status === "stopping" || status === "recovering";

  // Tick so elapsed times update while a batch is in flight.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const estBatches = estRows ? Math.ceil(estRows / rowsPerBatch) : 0;
  const planned = estBatches ? (limit === "all" ? estBatches : Math.min(estBatches, limit)) : 0;
  const finished = batches.filter((b) => b.status !== "running").length;
  const current = batches.find((b) => b.status === "running");
  const overall = planned ? Math.min(100, ((finished + (current ? 0.5 : 0)) / Math.max(planned, batches.length)) * 100) : null;

  const completed = batches.filter((b) => b.status === "done" && b.report?.composite_dqs != null);
  const failedCount = batches.filter((b) => b.status === "failed").length;
  const totalRows = completed.reduce((s, b) => s + b.rows, 0);
  const weighted = totalRows ? completed.reduce((s, b) => s + b.report.composite_dqs * b.rows, 0) / totalRows : null;
  const worst = completed.length > 1 ? completed.reduce((w, b) => (b.report.composite_dqs < w.report.composite_dqs ? b : w)) : null;

  const openBatch = async (b) => {
    if (!b.report.__slim) return onOpen(b.report);
    // After a reload only a summary is kept locally; the full report is fetched from the server.
    try {
      const j = await fetchJob(b.jobId);
      if (!j.report) throw new Error("no report");
      onOpen(j.report);
    } catch {
      toast.error("The full report for this batch has expired on the server. Its summary is still included in the batch report.");
    }
  };

  const exportSummary = () => {
    const lines = ["batch,file,rows,composite_dqs,grade,status"].concat(
      batches.map((b) => [b.index, b.name, b.rows, b.report?.composite_dqs ?? "", `"${b.report?.grade ?? ""}"`, b.status].join(","))
    );
    downloadText(`${fileName.replace(/\.csv$/i, "")}_batch_summary.csv`, lines.join("\r\n"));
  };

  const stem = fileName.replace(/\.csv$/i, "");
  const downloadReport = () => downloadText(`Assay_Batch_Report_${stem}.md`, batchReportMarkdown(run), "text/markdown");
  const downloadJson = () => downloadText(`Assay_Batch_Report_${stem}.json`, batchReportJson(run), "application/json");
  const downloadPdf = () => downloadBatchReportPdf(run);
  const canReport = (status === "done" || status === "interrupted") && completed.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-300">
          {status === "running" && <>Processing <b className="text-white">{fileName}</b> · batch {current?.index ?? finished + 1}{planned ? ` of ~${planned}` : ""}</>}
          {status === "recovering" && <>Reconnecting to <b className="text-white">{fileName}</b> · batch {current?.index ?? finished + 1} is still running on the server</>}
          {status === "stopping" && <>Stopping after the current batch…</>}
          {status === "done" && <>Finished <b className="text-white">{fileName}</b> · {finished} batch{finished === 1 ? "" : "es"}</>}
          {status === "interrupted" && <><b className="text-white">{fileName}</b> · {completed.length} batch{completed.length === 1 ? "" : "es"} finished</>}
        </div>
        {status === "running" && (
          <button onClick={stopBatchRun} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-red-500/40 hover:text-red-300 font-bold text-xs transition">
            <Square className="size-3.5" /> Stop after this batch
          </button>
        )}
      </div>

      {status === "interrupted" && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <AlertTriangle className="size-5 text-amber-300 shrink-0" />
          <div className="flex-1 min-w-56 text-sm text-amber-100">
            The page was reloaded during this run, so it paused. Finished batches are kept. Select the same file again to continue; unfinished or failed batches will be re-run.
          </div>
          {resumeSlot}
        </div>
      )}

      {overall !== null && running && (
        <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all duration-700" style={{ width: `${overall}%` }} />
        </div>
      )}

      {running && job && <div className="mt-5 max-w-md"><JobProgress job={job} ruleMode={run.ruleMode} narrative={false} /></div>}

      {batches.length > 0 && (
        <div className="mt-5 rounded-xl border border-white/10 overflow-hidden">
          {batches.map((b) => (
            <div key={b.index} className={`flex items-center gap-4 px-4 py-3 border-b border-white/5 last:border-0 text-sm ${b.status === "running" ? "bg-indigo-500/[0.07]" : ""}`}>
              <span className="w-6 text-slate-500 font-mono text-xs">{b.index}</span>
              <span className="flex-1 min-w-0 truncate text-slate-300">{b.name}</span>
              <span className="text-xs text-slate-500 hidden sm:block">{fmt(b.rows)} rows</span>
              <span className="text-xs text-slate-600 w-10 text-right hidden sm:block">{secs((b.finishedAt ?? Date.now()) - b.startedAt)}</span>
              {b.status === "running" && <span className="flex items-center gap-1.5 text-xs text-indigo-300 w-28 justify-end"><Loader2 className="size-4 animate-spin" />{job?.stage?.replace(/_/g, " ") || "queued"}</span>}
              {b.status === "failed" && <span title={b.error} className="flex items-center gap-1 text-xs text-red-400"><XCircle className="size-4" /> failed</span>}
              {b.status === "done" && (
                <>
                  <span className="flex items-center gap-1.5 font-mono text-indigo-300"><CheckCircle2 className="size-4 text-emerald-400" />{pct(b.report.composite_dqs)}</span>
                  <button onClick={() => openBatch(b)} className="flex items-center gap-0.5 text-xs text-slate-400 hover:text-white transition">Open <ChevronRight className="size-3.5" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canReport && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
          <div className="flex-1 min-w-48">
            <div className="text-sm font-semibold text-slate-100">{status === "done" ? "Analysis complete" : "Partial results available"}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Download the combined report: summary, per-batch scores, dimensions, findings, actions and audit trail.
              {status === "interrupted" && ` It covers the ${completed.length} finished batch${completed.length === 1 ? "" : "es"} only.`}
              {failedCount > 0 && ` ${failedCount} failed batch${failedCount === 1 ? " is" : "es are"} listed but not scored.`}
            </div>
          </div>
          <button onClick={downloadPdf} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold transition"><FileText className="size-4" /> Detailed report (PDF)</button>
          <button onClick={downloadReport} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-slate-300 hover:text-white transition"><Download className="size-4" /> Markdown</button>
          <button onClick={downloadJson} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-slate-300 hover:text-white transition"><Download className="size-4" /> JSON</button>
        </div>
      )}

      {completed.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
            Row-weighted score <b className="text-white">{pct(weighted)}</b> over {fmt(totalRows)} rows
          </span>
          {worst && (
            <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
              Lowest: batch {worst.index} <b className="text-amber-300">{pct(worst.report.composite_dqs)}</b>
            </span>
          )}
          <button onClick={exportSummary} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 text-slate-400 hover:text-white transition">
            <Download className="size-3.5" /> Summary CSV
          </button>
        </div>
      )}
    </div>
  );
}
