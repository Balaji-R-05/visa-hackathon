import { useSyncExternalStore } from "react";
import { assessCsv, pollAssessment } from "../api/api.js";
import { csvBatches, estimateRows } from "./csvBatches.js";
import { addToHistory } from "./history.js";

/*
 * App-wide batch run state. It is mirrored to localStorage (with slimmed-down reports) so that
 * after a reload the run is still visible: the batch that was in flight is re-attached by job id,
 * and the remaining batches can be resumed by selecting the same file again.
 */
const STORAGE_KEY = "assay_batch_run";
const IDLE = { status: "idle", fileName: "", fileSize: 0, estRows: 0, rowsPerBatch: 0, limit: "all", ruleMode: "", options: null, batches: [], job: null };
let state = IDLE;
let stopRequested = false;
const listeners = new Set();

const ACTIVE = ["running", "stopping", "recovering"];
export const isBatchRunning = () => ACTIVE.includes(state.status);

// Only what the aggregate report needs; the full report stays fetchable from the server by job id.
const slimReport = (r) => r && ({
  __slim: true,
  composite_dqs: r.composite_dqs, grade: r.grade, engine_version: r.engine_version, scoring_profile: r.scoring_profile,
  audit_id: r.audit_id, metadata_fingerprint: r.metadata_fingerprint,
  rules: { jurisdiction: r.rules?.jurisdiction, rule_mode: r.rules?.rule_mode },
  dimensions: (r.dimensions || []).map((d) => ({ dimension: d.dimension, applicable: d.applicable, score: d.score })),
  findings: (r.findings || []).map((f) => ({
    id: f.id, dimension: f.dimension, columns: f.columns, check: f.check, description: f.description, violations: f.violations,
    checked: f.checked, violation_ratio: f.violation_ratio, severity: f.severity, impact: f.impact, regulatory_context: f.regulatory_context,
  })),
  remediation_actions: (r.remediation_actions || []).map((a) => ({ action: a.action, priority: a.priority, expected_gain: a.expected_gain, finding_ids: a.finding_ids, dimension: a.dimension })),
  regulatory_compliance_risks: r.regulatory_compliance_risks || [],
});

const persist = () => {
  try {
    if (state.status === "idle") return localStorage.removeItem(STORAGE_KEY);
    const { job: _job, ...rest } = state;
    const batches = state.batches.map((b) => ({ ...b, report: slimReport(b.report) }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, batches }));
  } catch { /* storage full or unavailable: the run still works, it just won't survive a reload */ }
};

const set = (patch) => {
  const prev = state;
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  if (state.batches !== prev.batches || state.status !== prev.status || state.estRows !== prev.estRows) persist();
  listeners.forEach((l) => l());
};

const upsertBatch = (batch) =>
  set((s) => ({ batches: [...s.batches.filter((b) => b.index !== batch.index), batch].sort((a, b) => a.index - b.index) }));
const updateBatch = (index, patch) => set((s) => ({ batches: s.batches.map((b) => (b.index === index ? { ...b, ...patch } : b)) }));

export const useBatchRun = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);

export const stopBatchRun = () => {
  if (state.status !== "running") return;
  stopRequested = true;
  set({ status: "stopping" });
};

export const resetBatchRun = () => {
  if (isBatchRunning()) return;
  state = IDLE;
  persist();
  listeners.forEach((l) => l());
};

export const startBatchRun = async (file, options, { rowsPerBatch, limit }, { resume = false } = {}) => {
  if (isBatchRunning()) return;
  stopRequested = false;
  const keep = resume ? state.batches.filter((b) => b.status === "done") : [];
  const skip = new Set(keep.map((b) => b.index));
  set({ ...IDLE, status: "running", fileName: file.name, fileSize: file.size, rowsPerBatch, limit, ruleMode: options.ruleMode, options, batches: keep, estRows: resume ? state.estRows : 0 });
  if (!resume) estimateRows(file).then((estRows) => set({ estRows })).catch(() => {});

  const base = file.name.replace(/\.csv$/i, "");
  let done = keep.length;
  try {
    for await (const batch of csvBatches(file, rowsPerBatch, skip)) {
      if (batch.skipped) continue;
      const name = `${base}.part${String(batch.index).padStart(3, "0")}.csv`;
      upsertBatch({ index: batch.index, name, rows: batch.rows, status: "running", startedAt: Date.now() });
      set({ job: null });
      let jobIdSaved = false;
      try {
        // Narratives are skipped per batch: one LLM explanation per slice is slow and repetitive.
        const finished = await assessCsv(
          new File([batch.blob], name, { type: "text/csv" }),
          { ...options, narrative: false },
          (job) => {
            set({ job });
            if (job.job_id && !jobIdSaved) { jobIdSaved = true; updateBatch(batch.index, { jobId: job.job_id }); }
          },
          { track: false }
        );
        addToHistory(finished.report);
        updateBatch(batch.index, { status: "done", report: finished.report, finishedAt: Date.now() });
      } catch (err) {
        updateBatch(batch.index, { status: "failed", error: err.message, finishedAt: Date.now() });
      }
      done++;
      if (stopRequested || (limit !== "all" && done >= limit)) { set({ exhausted: false }); break; }
    }
    // If the loop ran to completion (not via the break above), the whole file was walked.
    set((s) => ({ status: "done", job: null, exhausted: s.exhausted !== false }));
  } catch (err) {
    set({ status: "done", job: null, error: err.message });
  }
};

// After a reload: re-attach to the batch that was in flight, then wait for the user to resume.
const recover = async () => {
  const running = state.batches.find((b) => b.status === "running");
  if (running?.jobId) {
    try {
      const finished = await pollAssessment(running.jobId, (job) => set({ job }));
      addToHistory(finished.report);
      updateBatch(running.index, { status: "done", report: finished.report, finishedAt: Date.now() });
    } catch (err) {
      updateBatch(running.index, { status: "failed", error: err.response?.status === 404 ? "job expired" : err.message, finishedAt: Date.now() });
    }
  } else if (running) {
    updateBatch(running.index, { status: "failed", error: "interrupted while uploading", finishedAt: Date.now() });
  }
  set({ status: "interrupted", job: null });
};

const hydrate = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || saved.status === "idle") return;
    state = { ...IDLE, ...saved, job: null };
    if (ACTIVE.includes(saved.status)) {
      state.status = "recovering";
      recover();
    }
  } catch { /* corrupt entry: ignore it */ }
};

if (typeof window !== "undefined") {
  hydrate();
  // Warn before closing the tab mid-run: the remaining batches can only be resumed by re-selecting the file.
  window.addEventListener("beforeunload", (e) => {
    if (state.status === "running" || state.status === "stopping") { e.preventDefault(); e.returnValue = ""; }
  });
}
