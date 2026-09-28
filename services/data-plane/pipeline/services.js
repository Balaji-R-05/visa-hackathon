// Clients for the Python services. Only metadata, rules and reports are sent.

export const SERVICE_URLS = {
  rules: process.env.RULE_SERVICE_URL || "http://localhost:8001",
  scoring: process.env.SCORING_SERVICE_URL || "http://localhost:8002",
  insights: process.env.INSIGHT_SERVICE_URL || "http://localhost:8003",
  audit: process.env.AUDIT_SERVICE_URL || "http://localhost:8004",
};

const TIMEOUTS_MS = {
  rules: Number(process.env.RULE_SERVICE_TIMEOUT_MS || 600000),     // local LLMs on CPU are slow
  scoring: 30000,
  insights: Number(process.env.INSIGHT_SERVICE_TIMEOUT_MS || 600000),
  audit: 10000,
};

export const internalHeaders = () =>
  process.env.INTERNAL_SERVICE_TOKEN ? { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN } : {};

export const callService = async (service, path, body) => {
  const res = await fetch(`${SERVICE_URLS[service]}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...internalHeaders() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUTS_MS[service]),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${service}${path} responded ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
};
