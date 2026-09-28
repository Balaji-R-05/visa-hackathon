import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import fileUpload from "express-fileupload";
import request from "supertest";
import { createApp, UPSTREAMS } from "../app.js";

let fake;
const seen = [];

beforeAll(async () => {
  // One fake upstream standing in for every internal service.
  const up = express();
  up.use(express.json());
  up.use(fileUpload());
  up.use((req, _res, next) => {
    seen.push({ path: req.path, token: req.get("x-internal-token") || null, body: req.body, file: req.files?.file?.name });
    next();
  });
  up.get("/health", (_req, res) => res.json({ status: "healthy" }));
  up.post("/jobs/csv", (req, res) => res.status(202).json({ job_id: "j1", status: "queued", rule_mode: req.body.rule_mode }));
  up.post("/jobs/postgres", (_req, res) => res.status(202).json({ job_id: "j2" }));
  up.get("/jobs/j1", (_req, res) => res.json({ job_id: "j1", status: "completed", report: { composite_dqs: 0.9 }, metadata: { big: true } }));
  up.get("/jobs/missing", (_req, res) => res.status(404).json({ error: "job not found or expired" }));
  up.post("/chat/stream", (_req, res) => {
    res.setHeader("content-type", "text/event-stream");
    res.write('data: {"content":"Hi"}\n\n');
    res.end("data: [DONE]\n\n");
  });
  up.get("/verify", (_req, res) => res.json({ valid: true, entries: 3 }));
  await new Promise((resolve) => {
    fake = up.listen(0, resolve);
  });
  const url = `http://127.0.0.1:${fake.address().port}`;
  for (const key of Object.keys(UPSTREAMS)) UPSTREAMS[key] = url;
  process.env.INTERNAL_SERVICE_TOKEN = "s3cret";
});

afterAll(() => {
  delete process.env.INTERNAL_SERVICE_TOKEN;
  fake?.close();
});

describe("Assay gateway", () => {
  const app = createApp();

  it("GET / should return gateway message", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Assay Gateway");
  });

  it("GET /api/health should return ok status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /non-existent-route should return 404", async () => {
    const res = await request(app).get("/api/non-existent");
    expect(res.statusCode).toBe(404);
  });

  it("forwards CSV uploads to the data-plane with the service token", async () => {
    const res = await request(app).post("/api/assessments/csv").field("rule_mode", "hybrid").attach("file", Buffer.from("a,b\n1,2"), "d.csv");
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ job_id: "j1", rule_mode: "hybrid" });
    const call = seen.find((s) => s.path === "/jobs/csv");
    expect(call).toMatchObject({ token: "s3cret", file: "d.csv" });
  });

  it("forwards database sources and rejects unknown ones", async () => {
    expect((await request(app).post("/api/assessments/postgres").send({ tableName: "t" })).status).toBe(202);
    expect((await request(app).post("/api/assessments/oracle").send({})).status).toBe(404);
  });

  it("omits bulky metadata from job status unless asked", async () => {
    const res = await request(app).get("/api/assessments/j1");
    expect(res.body).toEqual({ job_id: "j1", status: "completed", report: { composite_dqs: 0.9 } });
    expect((await request(app).get("/api/assessments/j1?include=metadata")).body.metadata).toEqual({ big: true });
    expect((await request(app).get("/api/assessments/missing")).status).toBe(404);
  });

  it("streams chat responses through", async () => {
    const res = await request(app).post("/api/chat/stream").send({ user_input: "hi" });
    expect(res.text).toContain('"content":"Hi"');
    expect(res.text).toContain("[DONE]");
  });

  it("reports service health and proxies governance endpoints", async () => {
    const health = await request(app).get("/api/health/services");
    expect(health.body.status).toBe("ok");
    expect(Object.keys(health.body.services)).toEqual(Object.keys(UPSTREAMS));
    expect((await request(app).get("/api/audit/verify")).body).toEqual({ valid: true, entries: 3 });
  });

  it("returns 502 when an upstream is down", async () => {
    const saved = UPSTREAMS.audit;
    UPSTREAMS.audit = "http://127.0.0.1:9";
    try {
      expect((await request(app).get("/api/audit/verify")).status).toBe(502);
    } finally {
      UPSTREAMS.audit = saved;
    }
  });
});
