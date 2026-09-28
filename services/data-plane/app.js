import crypto from "crypto";
import express from "express";
import fileUpload from "express-fileupload";
import { parseCSV } from "./sources/csv.js";
import { loadMongo, loadPostgres, ROW_LIMIT } from "./sources/database.js";
import { loadApi } from "./sources/api.js";
import { Jobs } from "./pipeline/jobStore.js";
import { runAssessment, RULE_MODES } from "./pipeline/runner.js";
import { buildFullMetadata } from "./utils/metadataExtractor.js";
import { JURISDICTIONS } from "./utils/ruleEngine.js";

/*
 * data-plane: the only service that ever holds raw rows. Internal API, reached
 * through the gateway; every other service receives metadata, rules or reports.
 */
export const createApp = ({ jobs = new Jobs(), deps = {} } = {}) => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 }, abortOnLimit: true }));

  app.get("/health", (_req, res) => res.json({ status: "healthy", service: "data-plane", jobs_backend: jobs.store.constructor.name }));

  app.use((req, res, next) => {
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    if (!token) return next();
    const supplied = Buffer.from(req.get("x-internal-token") || "");
    const expected = Buffer.from(token);
    if (supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)) return next();
    return res.status(401).json({ error: "missing or invalid internal token" });
  });

  const parseOptions = (body) => {
    const jurisdiction = String(body.jurisdiction || "GLOBAL").toUpperCase();
    const ruleMode = String(body.rule_mode || "builtin").toLowerCase();
    if (!JURISDICTIONS.includes(jurisdiction)) throw Object.assign(new Error(`jurisdiction must be one of ${JURISDICTIONS.join(", ")}`), { status: 400 });
    if (!RULE_MODES.includes(ruleMode)) throw Object.assign(new Error(`rule_mode must be one of ${RULE_MODES.join(", ")}`), { status: 400 });
    const narrative = !["false", "0", false].includes(body.narrative);
    // An approved rule set (e.g. derived earlier and reviewed) can be supplied instead of re-deriving.
    let providedRules = null;
    if (body.rules !== undefined && body.rules !== "") {
      try {
        const parsed = typeof body.rules === "string" ? JSON.parse(body.rules) : body.rules;
        const list = Array.isArray(parsed) ? parsed : parsed.rules;
        if (!Array.isArray(list)) throw new Error();
        // A supplied rule set has been reviewed, so its rules are enforced as given (never held).
        providedRules = {
          rules: list.map((r) => ({ ...r, approved: true })),
          optional_columns: Array.isArray(parsed.optional_columns) ? parsed.optional_columns : [],
        };
      } catch {
        throw Object.assign(new Error("rules must be a JSON array of rules or {rules, optional_columns}"), { status: 400 });
      }
      if (ruleMode === "builtin") throw Object.assign(new Error("rules can only be supplied with rule_mode llm or hybrid"), { status: 400 });
    }
    let freshnessDays;
    if (body.freshness_days !== undefined && body.freshness_days !== "") {
      freshnessDays = Number(body.freshness_days);
      if (!Number.isInteger(freshnessDays) || freshnessDays < 0 || freshnessDays > 36500) {
        throw Object.assign(new Error("freshness_days must be an integer from 0 (no age check) to 36500"), { status: 400 });
      }
    }
    return { jurisdiction, ruleMode, narrative, providedRules, freshnessDays };
  };

  const start = (sourceType, sourceName, loadRows, extra = {}) => async (req, res) => {
    let options;
    try {
      options = parseOptions(req.body || {});
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    const { providedRules, ...jobOptions } = options;
    const job = await jobs.create({
      source_type: sourceType,
      dataset_name: sourceName(req),
      options: { ...jobOptions, provided_rules: providedRules ? providedRules.rules.length : 0 },
    });
    runAssessment(jobs, job.job_id, () => loadRows(req), { ...options, sourceName: sourceName(req), sourceType, ...extra }, deps);
    return res.status(202).json({ job_id: job.job_id, status: job.status });
  };

  const requireCsv = (req) => {
    const file = req.files?.file;
    if (!file) throw Object.assign(new Error("No file uploaded"), { status: 400 });
    if (!file.name.toLowerCase().endsWith(".csv")) throw Object.assign(new Error("Only CSV files are supported"), { status: 400 });
    return file;
  };

  app.post("/jobs/csv", (req, res, next) => {
    try {
      requireCsv(req);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }
    return start("csv", (r) => r.files.file.name, (r) => parseCSV(r.files.file.data))(req, res, next);
  });
  app.post("/jobs/postgres", start("postgresql", (r) => r.body.tableName, (r) => loadPostgres(r.body), { rowLimit: ROW_LIMIT }));
  app.post("/jobs/mongo", start("mongodb", (r) => r.body.collectionName, (r) => loadMongo(r.body), { rowLimit: ROW_LIMIT }));
  app.post("/jobs/api", start("api", (r) => {
    try {
      const u = new URL(r.body.apiUrl);
      return `${u.host}${u.pathname}`; // never keep query strings (tokens) in names
    } catch {
      return "api";
    }
  }, (r) => loadApi(r.body)));

  app.get("/jobs/:id", async (req, res) => {
    const job = await jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found or expired" });
    return res.json(job);
  });

  // Synchronous profile + built-in rules, used by the evaluation harness.
  app.post("/profile/csv", async (req, res) => {
    try {
      const file = requireCsv(req);
      const { jurisdiction } = parseOptions(req.body || {});
      return res.json(buildFullMetadata(await parseCSV(file.data), file.name, "Unknown", "csv", { jurisdiction }));
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
  });

  return app;
};

export default createApp;
