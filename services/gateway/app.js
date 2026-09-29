import express from "express";
import cors from "cors";
import helmet from "helmet";
import { limiter, fileLimiter } from "./utils/limiter.js";

/*
 * gateway: the only public entry point. Owns CORS, security headers, rate and
 * size limits, and forwards to internal services with the service token.
 * It never parses datasets; uploads are streamed through to the data-plane.
 */

export const UPSTREAMS = {
  dataPlane: process.env.DATA_PLANE_URL || "http://localhost:7000",
  insights: process.env.INSIGHT_SERVICE_URL || "http://localhost:8003",
  audit: process.env.AUDIT_SERVICE_URL || "http://localhost:8004",
  policies: process.env.POLICY_SERVICE_URL || "http://localhost:8005",
  rules: process.env.RULE_SERVICE_URL || "http://localhost:8001",
  scoring: process.env.SCORING_SERVICE_URL || "http://localhost:8002",
};

const internalHeaders = () =>
  process.env.INTERNAL_SERVICE_TOKEN ? { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN } : {};

const upstream = async (service, path, { method = "GET", json, body, headers = {}, timeout = 30000 } = {}) => {
  const res = await fetch(`${UPSTREAMS[service]}${path}`, {
    method,
    headers: { ...internalHeaders(), ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : body,
    signal: AbortSignal.timeout(timeout),
  });
  return res;
};

const relay = async (res, upstreamRes) => {
  const text = await upstreamRes.text();
  res.status(upstreamRes.status);
  res.type(upstreamRes.headers.get("content-type") || "application/json");
  return res.send(text);
};

const unavailable = (res, service, err) =>
  res.status(502).json({ error: `${service} unavailable`, detail: err.name === "TimeoutError" ? "timeout" : err.message });

export const createApp = () => {
  const app = express();
  const origins = (process.env.CORS_ORIGIN || "http://localhost:3000").replace(/"/g, "").split(",").map((o) => o.trim());

  app.use(cors({ origin: origins.length === 1 ? origins[0] : origins, credentials: true }));
  app.use(helmet());
  app.use(express.json({ limit: "5mb" }));
  app.use(limiter);

  app.get("/", (_req, res) =>
    res.json({
      message: "Assay Gateway",
      endpoints: [
        "POST /api/assessments/{csv|postgres|mongo|api}",
        "POST /api/preview/{postgres|mongo|api}",
        "GET /api/assessments/:id",
        "POST /api/chat, /api/chat/stream",
        "POST /api/reports/export",
        "GET /api/audit/events, /api/audit/verify",
        "GET /api/policies/stats",
        "GET /api/health, /api/health/services",
      ],
    })
  );

  app.get("/api/health", (_req, res) => res.json({ status: "ok", now: new Date() }));

  app.get("/api/health/services", async (_req, res) => {
    const names = Object.keys(UPSTREAMS);
    const results = await Promise.all(
      names.map(async (name) => {
        try {
          const r = await upstream(name, "/health", { timeout: 3000 });
          return [name, r.ok ? await r.json() : { status: `http ${r.status}` }];
        } catch (err) {
          return [name, { status: "unreachable", error: err.message }];
        }
      })
    );
    const services = Object.fromEntries(results);
    const healthy = Object.values(services).every((s) => s.status === "healthy");
    res.status(healthy ? 200 : 207).json({ status: healthy ? "ok" : "degraded", services });
  });

  // --- assessments ---
  app.post("/api/assessments/csv", fileLimiter, async (req, res) => {
    const file = req.files?.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    const form = new FormData();
    form.append("file", new Blob([file.data], { type: "text/csv" }), file.name);
    for (const key of ["jurisdiction", "rule_mode", "narrative", "rules", "freshness_days"]) {
      if (req.body?.[key] !== undefined) form.append(key, String(req.body[key]));
    }
    try {
      return relay(res, await upstream("dataPlane", "/jobs/csv", { method: "POST", body: form, timeout: 120000 }));
    } catch (err) {
      return unavailable(res, "data-plane", err);
    }
  });

  app.post("/api/assessments/:source", async (req, res) => {
    if (!["postgres", "mongo", "api"].includes(req.params.source)) return res.status(404).json({ error: "unknown source" });
    try {
      return relay(res, await upstream("dataPlane", `/jobs/${req.params.source}`, { method: "POST", json: req.body || {} }));
    } catch (err) {
      return unavailable(res, "data-plane", err);
    }
  });

  app.post("/api/preview/:source", async (req, res) => {
    if (!["postgres", "mongo", "api"].includes(req.params.source)) return res.status(404).json({ error: "unknown source" });
    try {
      return relay(res, await upstream("dataPlane", `/preview/${req.params.source}`, { method: "POST", json: req.body || {}, timeout: 20000 }));
    } catch (err) {
      return unavailable(res, "data-plane", err);
    }
  });

  app.get("/api/assessments/:id", async (req, res) => {
    try {
      const r = await upstream("dataPlane", `/jobs/${encodeURIComponent(req.params.id)}`);
      if (!r.ok || req.query.include === "metadata") return relay(res, r);
      const { metadata: _omit, ...job } = await r.json();
      return res.json(job);
    } catch (err) {
      return unavailable(res, "data-plane", err);
    }
  });

  // --- insights ---
  app.post("/api/chat", async (req, res) => {
    try {
      return relay(res, await upstream("insights", "/chat", { method: "POST", json: req.body, timeout: 600000 }));
    } catch (err) {
      return unavailable(res, "insight-service", err);
    }
  });

  app.post("/api/chat/stream", async (req, res) => {
    try {
      const r = await upstream("insights", "/chat/stream", { method: "POST", json: req.body, timeout: 600000 });
      res.status(r.status);
      res.setHeader("content-type", "text/event-stream");
      res.setHeader("cache-control", "no-cache");
      for await (const chunk of r.body) res.write(chunk);
      return res.end();
    } catch (err) {
      if (!res.headersSent) return unavailable(res, "insight-service", err);
      return res.end();
    }
  });

  app.post("/api/reports/export", async (req, res) => {
    try {
      return relay(res, await upstream("insights", "/export-report", { method: "POST", json: req.body }));
    } catch (err) {
      return unavailable(res, "insight-service", err);
    }
  });

  // --- governance ---
  app.get("/api/audit/events", async (req, res) => {
    const qs = new URLSearchParams();
    if (req.query.limit) qs.set("limit", String(req.query.limit));
    if (req.query.dataset_id) qs.set("dataset_id", String(req.query.dataset_id));
    try {
      return relay(res, await upstream("audit", `/events?${qs}`));
    } catch (err) {
      return unavailable(res, "audit-service", err);
    }
  });

  app.get("/api/audit/verify", async (_req, res) => {
    try {
      return relay(res, await upstream("audit", "/verify"));
    } catch (err) {
      return unavailable(res, "audit-service", err);
    }
  });

  app.get("/api/policies/stats", async (_req, res) => {
    try {
      return relay(res, await upstream("policies", "/policies/stats"));
    } catch (err) {
      return unavailable(res, "policy-service", err);
    }
  });

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  return app;
};

export default createApp;
