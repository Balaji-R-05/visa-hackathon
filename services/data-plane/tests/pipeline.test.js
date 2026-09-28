import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { Jobs, createStore } from "../pipeline/jobStore.js";
import { isPrivateAddress, assertPublicUrl } from "../utils/ssrf.js";

const CSV = [
  "transaction_id,amount,currency,txn_timestamp,email",
  "TXN000001,100,INR,2026-09-01 10:00:00,a@bank.com",
  "TXN000002,-5,inr,2026-09-02 10:00:00,b@bank.com",
  "TXN000003,,USD,2026-09-03 10:00:00,",
].join("\n");

// Fake Python services: record what crosses the boundary and answer like the real ones.
const fakeServices = ({ derive } = {}) => {
  const calls = [];
  const callService = vi.fn(async (service, path, body) => {
    calls.push({ service, path, body });
    if (path === "/rules/derive") {
      if (derive === "down") throw new Error("rule-service unreachable");
      return {
        status: "ok", model: "ollama/test", local_model: true, latency_ms: 5, proposed: 2,
        optional_columns: ["email"], rejected: [{ rule: { type: "regex", column: "x" }, reason: "unknown column(s): x" }],
        citation_stats: { cited: 1, valid: 1 }, policy_context: { retrieval: "lexical", clauses: ["RBI_KYC:Section 16"] },
        rules: [{ id: "L:Validity:regex:transaction_id:0", source: "llm", dimension: "Validity", type: "regex", column: "transaction_id", params: { pattern: "^TXN[0-9]{6}$" }, citations: ["RBI_KYC:Section 16"], regulation: "RBI_KYC:Section 16" }],
      };
    }
    if (path === "/score") return { composite_dqs: 0.9, dataset: body.dataset, rules: { rule_mode: body.rule_evaluation.rule_mode }, metadata_fingerprint: "f" };
    if (path === "/insights") return { ...body, narrative_source: "llm" };
    if (path === "/events") return { audit_id: "audit-1" };
    throw new Error(`unexpected ${path}`);
  });
  return { calls, callService };
};

const poll = async (app, id) => {
  for (let i = 0; i < 50; i++) {
    const res = await request(app).get(`/jobs/${id}`);
    if (["completed", "failed"].includes(res.body.status)) return res.body;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("job did not finish");
};

describe("assessment jobs", () => {
  it("runs the full pipeline and never sends rows to other services", async () => {
    const { calls, callService } = fakeServices();
    const app = createApp({ jobs: new Jobs(createStore(null)), deps: { callService } });
    const res = await request(app).post("/jobs/csv").field("jurisdiction", "IN").field("rule_mode", "hybrid").attach("file", Buffer.from(CSV), "p.csv");
    expect(res.status).toBe(202);
    const job = await poll(app, res.body.job_id);

    expect(job.status).toBe("completed");
    expect(job.report.audit_id).toBe("audit-1");
    expect(job.report.narrative_source).toBe("llm");
    expect(Object.keys(job.timings_ms)).toEqual(["ingesting", "profiling", "deriving_rules", "executing_rules", "scoring", "explaining", "auditing"]);

    const outbound = JSON.stringify(calls.map((c) => c.body));
    for (const value of ["a@bank.com", "b@bank.com", "TXN000002"]) expect(outbound).not.toContain(value);

    const scored = calls.find((c) => c.path === "/score").body.rule_evaluation;
    const llmRule = scored.rules.find((r) => r.source === "llm");
    expect(llmRule).toMatchObject({ checked: 3, violations: 0, citations: ["RBI_KYC:Section 16"] });
    expect(scored.optional_columns).toEqual(["email"]);
    expect(scored.rules.some((r) => r.type === "not_null" && r.column === "email")).toBe(false);
    expect(scored.rejected.some((r) => r.reason.startsWith("unknown column"))).toBe(true);
    expect(scored.derivation).toMatchObject({ status: "ok", model: "ollama/test", local_model: true });
  });

  it("falls back to built-in rules when rule derivation is down", async () => {
    const { callService } = fakeServices({ derive: "down" });
    const app = createApp({ jobs: new Jobs(createStore(null)), deps: { callService } });
    const res = await request(app).post("/jobs/csv").field("rule_mode", "llm").attach("file", Buffer.from(CSV), "p.csv");
    const job = await poll(app, res.body.job_id);
    expect(job.status).toBe("completed");
    expect(job.report.rules.rule_mode).toBe("builtin");
    expect(job.warnings[0]).toMatch(/Rule derivation unavailable/);
  });

  it("enforces a supplied rule set without calling the rule deriver", async () => {
    const { calls, callService } = fakeServices();
    const app = createApp({ jobs: new Jobs(createStore(null)), deps: { callService } });
    const rules = [{ id: "approved-1", source: "llm", dimension: "Validity", type: "range", column: "amount", params: { min: 0 } },
                   { id: "bad", source: "llm", dimension: "Validity", type: "regex", column: "amount", params: { pattern: "(a+)+" } }];
    const res = await request(app).post("/jobs/csv").field("rule_mode", "llm").field("rules", JSON.stringify(rules)).attach("file", Buffer.from(CSV), "p.csv");
    const job = await poll(app, res.body.job_id);
    expect(calls.some((c) => c.path === "/rules/derive")).toBe(false);
    const evaluation = calls.find((c) => c.path === "/score").body.rule_evaluation;
    expect(evaluation.rules.find((r) => r.id === "approved-1")).toMatchObject({ checked: 2, violations: 1 });
    expect(evaluation.rejected.map((r) => r.reason)).toEqual([expect.stringMatching(/nested/)]);
    expect(evaluation.derivation.model).toBe("provided");
    expect(job.options.provided_rules).toBe(2);
    const bad = await request(app).post("/jobs/csv").field("rule_mode", "builtin").field("rules", "[]").attach("file", Buffer.from(CSV), "p.csv");
    expect(bad.status).toBe(400);
  });

  it("validates options and inputs", async () => {
    const app = createApp({ jobs: new Jobs(createStore(null)), deps: fakeServices() });
    expect((await request(app).post("/jobs/csv").field("jurisdiction", "MARS").attach("file", Buffer.from(CSV), "p.csv")).status).toBe(400);
    expect((await request(app).post("/jobs/csv").attach("file", Buffer.from("x"), "p.txt")).status).toBe(400);
    expect((await request(app).get("/jobs/nope")).status).toBe(404);
  });

  it("requires the internal token when configured", async () => {
    process.env.INTERNAL_SERVICE_TOKEN = "s3cret";
    try {
      const app = createApp({ jobs: new Jobs(createStore(null)) });
      expect((await request(app).get("/jobs/x")).status).toBe(401);
      expect((await request(app).get("/jobs/x").set("x-internal-token", "s3cret")).status).toBe(404);
      expect((await request(app).get("/health")).status).toBe(200);
    } finally {
      delete process.env.INTERNAL_SERVICE_TOKEN;
    }
  });
});

describe("SSRF guard", () => {
  it("classifies addresses", () => {
    for (const ip of ["127.0.0.2", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("resolves hostnames before allowing them", async () => {
    const lookup = async (host) => (host === "evil.example" ? [{ address: "127.0.0.1" }] : [{ address: "93.184.216.34" }]);
    await expect(assertPublicUrl("http://evil.example/data", lookup)).rejects.toThrow();
    await expect(assertPublicUrl("http://localhost/x", lookup)).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd", lookup)).rejects.toThrow();
    await expect(assertPublicUrl("https://good.example/data", lookup)).resolves.toBeInstanceOf(URL);
  });
});
