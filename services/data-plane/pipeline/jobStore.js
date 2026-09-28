import crypto from "crypto";

/*
 * Job state: status, stage timings, and the finished report/metadata. Never rows.
 * Redis when REDIS_URL is set (shared across data-plane replicas), otherwise an
 * in-process map. Both expire entries after JOB_TTL_SECONDS.
 */

const TTL_SECONDS = Number(process.env.JOB_TTL_SECONDS || 3600);

class MemoryStore {
  constructor() {
    this.jobs = new Map();
  }
  async set(id, job) {
    this.jobs.set(id, { job, expires: Date.now() + TTL_SECONDS * 1000 });
  }
  async get(id) {
    const entry = this.jobs.get(id);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
      this.jobs.delete(id);
      return null;
    }
    return entry.job;
  }
  async close() {}
}

class RedisStore {
  constructor(url) {
    this.url = url;
    this.client = null;
  }
  async connect() {
    if (!this.client) {
      const { createClient } = await import("redis");
      this.client = createClient({ url: this.url });
      this.client.on("error", (err) => console.error("Redis error:", err.message));
      await this.client.connect();
    }
    return this.client;
  }
  async set(id, job) {
    await (await this.connect()).set(`dqs:job:${id}`, JSON.stringify(job), { EX: TTL_SECONDS });
  }
  async get(id) {
    const raw = await (await this.connect()).get(`dqs:job:${id}`);
    return raw ? JSON.parse(raw) : null;
  }
  async close() {
    if (this.client) await this.client.quit();
  }
}

export const createStore = (url = process.env.REDIS_URL) => (url ? new RedisStore(url) : new MemoryStore());

export class Jobs {
  constructor(store = createStore()) {
    this.store = store;
  }

  async create(fields) {
    const now = new Date().toISOString();
    const job = { job_id: crypto.randomUUID(), status: "queued", stage: "queued", created_at: now, updated_at: now, timings_ms: {}, warnings: [], ...fields };
    await this.store.set(job.job_id, job);
    return job;
  }

  async update(id, patch) {
    const job = (await this.store.get(id)) || { job_id: id };
    const next = { ...job, ...patch, updated_at: new Date().toISOString() };
    await this.store.set(id, next);
    return next;
  }

  get(id) {
    return this.store.get(id);
  }
}
