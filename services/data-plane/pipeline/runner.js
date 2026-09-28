import { profileDataset, applyRules, EXTRACTOR_VERSION } from "../utils/metadataExtractor.js";
import { callService as defaultCallService } from "./services.js";

export const RULE_MODES = ["builtin", "llm", "hybrid"];

const CONCURRENCY = Number(process.env.JOB_CONCURRENCY || 2);
let active = 0;
const waiting = [];

// Bounded concurrency: local LLM calls are heavy, so jobs beyond the limit queue.
const acquire = () =>
  new Promise((resolve) => {
    if (active < CONCURRENCY) {
      active++;
      resolve();
    } else {
      waiting.push(resolve);
    }
  });
const release = () => {
  const next = waiting.shift();
  if (next) next();
  else active--;
};

const auditRecord = (report, options, sourceType) => ({
  dataset_id: report.dataset?.dataset_id,
  dataset_name: report.dataset?.dataset_name,
  source_type: sourceType,
  row_count: report.dataset?.row_count,
  column_count: report.dataset?.column_count,
  metadata_fingerprint: report.metadata_fingerprint,
  composite_dqs: report.composite_dqs,
  grade: report.grade,
  dimension_scores: report.dimension_scores,
  jurisdiction: options.jurisdiction,
  rule_mode: report.rules?.rule_mode,
  rules_by_source: report.rules?.applied_by_source,
  rule_model: report.rules?.derivation?.model ?? null,
  narrative_source: report.narrative_source,
  narrative_model: report.narrative_model,
  grounding_score: report.grounding?.score ?? null,
  engine_version: report.engine_version,
  extractor_version: EXTRACTOR_VERSION,
});

/*
 * Runs one assessment. `loadRows` is the only place raw data enters; rows and
 * the column-major context are dropped as soon as rules have executed, before
 * any network call that leaves the data-plane.
 */
export const runAssessment = async (jobs, jobId, loadRows, options, deps = {}) => {
  const call = deps.callService || defaultCallService;
  const { sourceName, sourceType, jurisdiction = "GLOBAL", ruleMode = "builtin", narrative = true, rowLimit, providedRules, freshnessDays } = options;
  const timings = {};
  const warnings = [];
  const stage = async (name, fn) => {
    await jobs.update(jobId, { status: "running", stage: name });
    const started = performance.now();
    try {
      return await fn();
    } finally {
      timings[name] = Math.round(performance.now() - started);
    }
  };

  await acquire();
  try {
    let rows = await stage("ingesting", () => loadRows());
    let { metadata, context } = await stage("profiling", () => profileDataset(rows, sourceName, sourceType, { rowLimit, freshnessDays }));
    rows = null;

    let derived = { rules: [], optional_columns: [], rejected: [], status: "skipped" };
    if (ruleMode !== "builtin" && providedRules) {
      derived = { ...providedRules, rejected: [], status: "ok", model: "provided", proposed: providedRules.rules.length };
    } else if (ruleMode !== "builtin") {
      derived = await stage("deriving_rules", async () => {
        try {
          return await call("rules", "/rules/derive", {
            dataset: metadata.dataset,
            columns: metadata.columns,
            categorical_stats: metadata.categorical_stats,
            jurisdiction,
          });
        } catch (err) {
          return { rules: [], optional_columns: [], rejected: [], status: "unavailable", error: err.message };
        }
      });
      if (derived.status !== "ok") warnings.push(`Rule derivation ${derived.status}: ${derived.error || "no rules"}; built-in rules used`);
    }
    const effectiveMode = ruleMode !== "builtin" && derived.status !== "ok" ? "builtin" : ruleMode;

    metadata = await stage("executing_rules", () => {
      const withRules = applyRules(metadata, context, {
        jurisdiction,
        ruleMode: effectiveMode,
        derivedRules: derived.rules || [],
        optionalColumns: derived.optional_columns || [],
      });
      withRules.rule_evaluation.rejected.push(...(derived.rejected || []).map((r) => ({ ...r, rule: { ...r.rule, source: "llm" } })));
      withRules.rule_evaluation.derivation = ruleMode === "builtin" ? null : {
        requested_mode: ruleMode,
        status: derived.status,
        model: derived.model ?? null,
        local_model: derived.local_model ?? null,
        latency_ms: derived.latency_ms ?? null,
        proposed: derived.proposed ?? 0,
        accepted_by_deriver: (derived.rules || []).length,
        citation_stats: derived.citation_stats ?? {},
        policy_context: derived.policy_context ?? {},
        error: derived.error ?? null,
      };
      return withRules;
    });
    context = null;

    let report = await stage("scoring", () => call("scoring", "/score", metadata));

    if (narrative) {
      report = await stage("explaining", async () => {
        try {
          return await call("insights", "/insights", report);
        } catch (err) {
          warnings.push(`Narrative unavailable: ${err.message}`);
          return report;
        }
      });
    }

    await stage("auditing", async () => {
      try {
        const { audit_id } = await call("audit", "/events", { event: "assessment_completed", data: auditRecord(report, options, sourceType) });
        report.audit_id = audit_id;
      } catch (err) {
        warnings.push(`Audit log unavailable: ${err.message}`);
      }
    });

    return await jobs.update(jobId, { status: "completed", stage: "done", timings_ms: timings, warnings, report, metadata });
  } catch (err) {
    console.error(`Job ${jobId} failed:`, err.message);
    try {
      await call("audit", "/events", { event: "assessment_failed", data: { job_id: jobId, source_type: sourceType, error: err.message.slice(0, 300) } });
    } catch {
      /* audit is best-effort on failure paths */
    }
    return jobs.update(jobId, { status: "failed", stage: "failed", timings_ms: timings, warnings, error: err.message, http_status: err.status || 500 });
  } finally {
    release();
  }
};
