import { api, API_BASE_URL } from "./axiosInstance";

export const JURISDICTIONS = [
  { value: "GLOBAL", label: "Global (PCI DSS, ISO)" },
  { value: "IN", label: "India (RBI, DPDP)" },
  { value: "EU", label: "European Union (GDPR)" },
  { value: "US", label: "United States (GLBA, BSA)" },
];

export const RULE_MODES = [
  { value: "hybrid", label: "Hybrid", hint: "Built-in rules plus rules derived by the LLM from column profiles" },
  { value: "builtin", label: "Built-in only", hint: "Deterministic rule library; no LLM involved in rules" },
  { value: "llm", label: "LLM-derived", hint: "Rules proposed by the LLM, validated and executed deterministically" },
];

export const STAGES = [
  ["queued", "Queued"],
  ["ingesting", "Reading source"],
  ["profiling", "Profiling columns (privacy-preserving)"],
  ["deriving_rules", "Deriving jurisdiction rules"],
  ["executing_rules", "Executing rules"],
  ["scoring", "Scoring dimensions"],
  ["explaining", "Writing explanations"],
  ["auditing", "Recording audit entry"],
];

const errorMessage = (err) => err.response?.data?.error || err.response?.data?.message || err.message;

/**
 * Polls an assessment job until it completes, reporting each stage change.
 * Resolves with the finished job (report included); rejects with a readable error.
 */
export const pollAssessment = async (jobId, onProgress, { intervalMs = 1500, timeoutMs = 15 * 60 * 1000 } = {}) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data: job } = await api.get(`/assessments/${jobId}`);
    onProgress?.(job);
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error || "Assessment failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Assessment timed out");
};

const run = async (startRequest, onProgress) => {
  try {
    const { data } = await startRequest();
    onProgress?.({ status: "queued", stage: "queued", job_id: data.job_id });
    return await pollAssessment(data.job_id, onProgress);
  } catch (err) {
    throw new Error(errorMessage(err));
  }
};

export const assessCsv = (file, options, onProgress) => {
  const form = new FormData();
  form.append("file", file);
  form.append("jurisdiction", options.jurisdiction);
  form.append("rule_mode", options.ruleMode);
  form.append("narrative", String(options.narrative));
  form.append("freshness_days", String(options.freshnessDays ?? 365));
  if (options.approvedRules) form.append("rules", JSON.stringify(options.approvedRules));
  return run(() => api.post("/assessments/csv", form, { headers: { "Content-Type": "multipart/form-data" } }), onProgress);
};

const jsonOptions = (options) => ({
  jurisdiction: options.jurisdiction,
  rule_mode: options.ruleMode,
  narrative: options.narrative,
  freshness_days: options.freshnessDays ?? 365,
  ...(options.approvedRules ? { rules: options.approvedRules } : {}),
});

export const assessPostgres = ({ dbLink, tableName }, options, onProgress) =>
  run(() => api.post("/assessments/postgres", { connectionString: dbLink, tableName, ...jsonOptions(options) }), onProgress);

export const assessMongo = ({ dbLink, dbName, collectionName }, options, onProgress) =>
  run(() => api.post("/assessments/mongo", { uri: dbLink, dbName, collectionName, ...jsonOptions(options) }), onProgress);

export const assessApi = ({ apiUrl }, options, onProgress) =>
  run(() => api.post("/assessments/api", { apiUrl, ...jsonOptions(options) }), onProgress);

/**
 * Streaming chat with the auditor (server-sent events through the gateway).
 */
export const chatWithAIStream = async ({ auditContext, messages, userInput, onChunk }) => {
  const response = await fetch(`${API_BASE_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_context: auditContext, messages, user_input: userInput }),
  });
  if (!response.ok) throw new Error("Stream request failed");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop();
    for (const event of events) {
      if (!event.startsWith("data: ")) continue;
      const data = event.slice(6);
      if (data === "[DONE]") return;
      const parsed = JSON.parse(data);
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.content) onChunk(parsed.content);
    }
  }
};

export const exportReport = async (report) => {
  const { data } = await api.post("/reports/export", report);
  return data.markdown;
};

export const verifyAuditLog = async () => (await api.get("/audit/verify")).data;
