import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Layers, Play, ExternalLink } from "lucide-react";
import { estimateRows } from "../utils/csvBatches.js";
import { startBatchRun, useBatchRun } from "../utils/batchStore.js";
import BatchProgress from "./BatchProgress.jsx";

const ROW_CHOICES = [100_000, 250_000, 500_000, 1_000_000];
const BATCH_LIMITS = [["all", "All batches"], [3, "First 3"], [5, "First 5"], [10, "First 10"]];
const fmt = (n) => n.toLocaleString();

export default function BatchPanel({ file, options, onOpen }) {
  const run = useBatchRun();
  const navigate = useNavigate();
  const [rowsPerBatch, setRowsPerBatch] = useState(500_000);
  const [limit, setLimit] = useState("all");
  const [estRows, setEstRows] = useState(0);
  const ref = useRef(null);
  const active = ["running", "stopping", "recovering"].includes(run.status);
  const canResume = run.status === "interrupted" && run.fileName === file.name && run.fileSize === file.size;
  // Show the shared run whenever there is one for this file (it survives leaving the page).
  const showRun = run.status !== "idle" && run.fileName === file.name;

  useEffect(() => {
    estimateRows(file).then(setEstRows).catch(() => setEstRows(0));
  }, [file]);

  const estBatches = estRows ? Math.ceil(estRows / rowsPerBatch) : null;
  const planned = estBatches && limit !== "all" ? Math.min(estBatches, limit) : estBatches;

  const resume = () => {
    startBatchRun(file, run.options, { rowsPerBatch: run.rowsPerBatch, limit: run.limit }, { resume: true });
  };

  const start = () => {
    startBatchRun(file, options, { rowsPerBatch, limit });
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const select = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50";

  return (
    <div ref={ref} className="mt-8 rounded-[2rem] border border-indigo-500/20 bg-indigo-500/[0.04] p-6 md:p-8 scroll-mt-24">
      <div className="flex items-center gap-3 mb-2">
        <Layers className="size-5 text-indigo-400" />
        <span className="font-bold text-sm uppercase tracking-wider">Batch processing</span>
      </div>
      <p className="text-sm text-slate-400 max-w-3xl">
        Splits this file in your browser into slices under the upload limit and assesses them one after another. Each batch is scored independently, so duplicates
        that span two batches are not detected. Narratives are skipped per batch. You can leave this page; progress stays in the navbar and on the Batch page.
      </p>

      <div className="flex flex-wrap items-end gap-4 mt-6">
        <label className="text-xs text-slate-400">
          <span className="block mb-1.5">Rows per batch</span>
          <select className={select} value={rowsPerBatch} onChange={(e) => setRowsPerBatch(Number(e.target.value))} disabled={active}>
            {ROW_CHOICES.map((n) => <option key={n} value={n} className="bg-black">{fmt(n)}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          <span className="block mb-1.5">Process</span>
          <select className={select} value={limit} onChange={(e) => setLimit(e.target.value === "all" ? "all" : Number(e.target.value))} disabled={active}>
            {BATCH_LIMITS.map(([v, l]) => <option key={v} value={v} className="bg-black">{l}</option>)}
          </select>
        </label>
        <button onClick={start} disabled={active || canResume} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-bold text-sm transition shadow-lg shadow-indigo-600/20">
          <Play className="size-4" /> Start batch run{planned ? ` (~${planned} batch${planned > 1 ? "es" : ""})` : ""}
        </button>
        {showRun && (
          <button onClick={() => navigate("/batch")} className="flex items-center gap-1.5 pb-2.5 text-xs text-slate-400 hover:text-white transition">
            <ExternalLink className="size-3.5" /> Open full view
          </button>
        )}
        {estRows > 0 && <span className="text-xs text-slate-500 pb-2.5">~{fmt(estRows)} rows in file</span>}
      </div>

      {showRun && <div className="mt-6"><BatchProgress
        run={run}
        onOpen={onOpen}
        resumeSlot={canResume ? (
          <button onClick={resume} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm transition"><Play className="size-4" /> Resume run</button>
        ) : <span className="text-xs text-amber-200/80">Selected file does not match ({run.fileName})</span>}
      /></div>}
    </div>
  );
}
