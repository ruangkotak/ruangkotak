// Key-value store behind the preview limit, leads and applications.
// Live: Upstash Redis over its REST API when UPSTASH_REDIS_REST_URL/TOKEN are set (required on Vercel, where memory resets per instance).
// Local: in-memory, resets on restart.
import type { Lead, LeadRecord, Report } from "./types";

type StoredLead = Lead & { reportId: string; at: string };

type Mem = {
  devices: Map<string, { handle: string; at: string }>; // device key -> first handle previewed
  reports: Map<string, Report>;
  pdfs: Map<string, Uint8Array>;
  leads: StoredLead[];
  inquiries: Map<string, LeadRecord>; // lead id -> mutable record (status, attempts, last error)
  open: Set<string>; // lead ids still owed a report or an owner alert
  due: Map<string, number>; // lead id -> unix ms when a retry may run
  locks: Map<string, number>; // lead id -> unix ms when the in-flight attempt lock expires
  applications: Record<string, string>[];
  counters: Map<string, number>;
};

const g = globalThis as unknown as { __rk?: Mem };
const mem: Mem = (g.__rk ??= { devices: new Map(), reports: new Map(), pdfs: new Map(), leads: [], inquiries: new Map(), open: new Set(), due: new Map(), locks: new Map(), applications: [], counters: new Map() });
mem.pdfs ??= new Map(); // a dev server's store from before pdfs existed
mem.inquiries ??= new Map();
mem.open ??= new Set();
mem.due ??= new Map();
mem.locks ??= new Map();

const { UPSTASH_REDIS_REST_URL: URL, UPSTASH_REDIS_REST_TOKEN: TOKEN } = process.env;
export const REDIS = !!(URL && TOKEN);

async function redis<T = unknown>(...cmd: (string | number)[]): Promise<T> {
  const res = await fetch(URL!, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Upstash ${cmd[0]}: ${data.error ?? res.status}`);
  return data.result as T;
}

const at = () => new Date().toISOString();
const parse = <T>(s: string | null) => (s ? (JSON.parse(s) as T) : null);

const memStore = {
  deviceHandle: async (key: string) => mem.devices.get(key)?.handle ?? null,
  setDeviceHandle: async (key: string, handle: string) => void mem.devices.set(key, { handle, at: at() }),
  // Keeps the first account on this device. A later call does not overwrite it.
  reserveDevice: async (key: string, handle: string) => {
    const cur = mem.devices.get(key)?.handle;
    if (cur) return cur;
    mem.devices.set(key, { handle, at: at() });
    return handle;
  },
  saveReport: async (r: Report) => void mem.reports.set(r.id, r),
  getReport: async (id: string) => mem.reports.get(id) ?? null,
  getPdf: async (id: string, version: string) => mem.pdfs.get(`${version}:${id}`) ?? null,
  savePdf: async (id: string, version: string, pdf: Uint8Array) => void mem.pdfs.set(`${version}:${id}`, pdf),
  isUnlocked: async (reportId: string) => mem.leads.some((l) => l.reportId === reportId),
  addLead: async (reportId: string, lead: Lead) => void mem.leads.push({ ...lead, reportId, at: at() }),
  saveLeadRecord: async (r: LeadRecord) => {
    const copy = structuredClone(r);
    mem.inquiries.set(r.id, copy);
    return structuredClone(copy);
  },
  getLeadRecord: async (id: string) => {
    const r = mem.inquiries.get(id);
    return r ? structuredClone(r) : null;
  },
  updateLeadRecord: async (id: string, patch: Partial<LeadRecord>) => {
    const cur = mem.inquiries.get(id);
    if (!cur) return null;
    const next: LeadRecord = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, updatedAt: at(), timestamps: patch.timestamps ?? cur.timestamps };
    mem.inquiries.set(id, next);
    return structuredClone(next);
  },
  watchLead: async (id: string) => void mem.open.add(id),
  unwatchLead: async (id: string) => {
    mem.open.delete(id);
    mem.due.delete(id);
  },
  scheduleRetryAt: async (id: string, atMs: number) => {
    mem.open.add(id);
    mem.due.set(id, atMs);
  },
  dueLeadIds: async (nowMs: number) => [...mem.due.entries()].filter(([, due]) => due <= nowMs).sort((a, b) => a[1] - b[1]).map(([id]) => id),
  openLeadIds: async () => [...mem.open],
  claimLead: async (id: string, ttlSeconds: number) => {
    if ((mem.locks.get(id) ?? 0) > Date.now()) return false;
    mem.locks.set(id, Date.now() + ttlSeconds * 1000);
    return true;
  },
  releaseLead: async (id: string) => void mem.locks.delete(id),
  leadLocked: async (id: string) => (mem.locks.get(id) ?? 0) > Date.now(),
  addApplication: async (a: Record<string, string>) => void mem.applications.push({ ...a, at: at() }),
  // Counts calls per bucket; the TTL only applies in Redis (memory resets on restart anyway).
  hit: async (key: string, _ttlSeconds: number) => {
    const n = (mem.counters.get(key) ?? 0) + 1;
    mem.counters.set(key, n);
    return n;
  },
};

// The privacy notice promises deletion 12 months after creation, so every personal-data key expires then.
// A key's expiry is set once, when it is created; later writes keep it (KEEPTTL) instead of restarting the clock.
const RETAIN = 365 * 24 * 60 * 60;

async function setOnce(key: string, value: string) {
  if ((await redis<string | null>("SET", key, value, "EX", RETAIN, "NX")) === null) await redis("SET", key, value, "KEEPTTL");
}

// Keys: dev:<device> first handle, rep:<id> report, pdf:<version>:<id> that report's PDF (base64),
// lead:<id> contact details that unlock the report, inq:<leadId> the mutable lead (status, attempts, last error),
// inq:open ids still owed a report or an alert, inq:due retry times, lock:inq:<id> one in-flight attempt,
// app:<time>:<rand> one application, rl:<bucket> counters.
// No all-time lists: list items can't expire one by one; find leads with SCAN inq:* and applications with SCAN app:*.
const redisStore: typeof memStore = {
  deviceHandle: async (key) => parse<{ handle: string }>(await redis<string | null>("GET", `dev:${key}`))?.handle ?? null,
  setDeviceHandle: async (key, handle) => void (await setOnce(`dev:${key}`, JSON.stringify({ handle, at: at() }))),
  reserveDevice: async (key, handle) => {
    const value = JSON.stringify({ handle, at: at() });
    if ((await redis<string | null>("SET", `dev:${key}`, value, "EX", RETAIN, "NX")) === "OK") return handle;
    return parse<{ handle: string }>(await redis<string | null>("GET", `dev:${key}`))?.handle ?? handle;
  },
  saveReport: async (r) => void (await setOnce(`rep:${r.id}`, JSON.stringify(r))),
  getReport: async (id) => parse<Report>(await redis<string | null>("GET", `rep:${id}`)),
  getPdf: async (id, version) => {
    const b64 = await redis<string | null>("GET", `pdf:${version}:${id}`);
    return b64 ? new Uint8Array(Buffer.from(b64, "base64")) : null;
  },
  // The PDF is personal data too: it expires with its report, never later. No report (or no expiry), no cache.
  savePdf: async (id, version, pdf) => {
    const ttl = await redis<number>("TTL", `rep:${id}`);
    if (ttl > 0) await redis("SET", `pdf:${version}:${id}`, Buffer.from(pdf).toString("base64"), "EX", ttl);
  },
  isUnlocked: async (reportId) => (await redis<number>("EXISTS", `lead:${reportId}`)) === 1,
  addLead: async (reportId, lead) => {
    const n = await redis<number>("RPUSH", `lead:${reportId}`, JSON.stringify({ ...lead, reportId, at: at() }));
    if (n === 1) await redis("EXPIRE", `lead:${reportId}`, RETAIN);
  },
  saveLeadRecord: async (r) => {
    await redis("SET", `inq:${r.id}`, JSON.stringify(r), "EX", RETAIN);
    return r;
  },
  getLeadRecord: async (id) => parse<LeadRecord>(await redis<string | null>("GET", `inq:${id}`)),
  updateLeadRecord: async (id, patch) => {
    const cur = parse<LeadRecord>(await redis<string | null>("GET", `inq:${id}`));
    if (!cur) return null;
    const next: LeadRecord = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, updatedAt: at(), timestamps: patch.timestamps ?? cur.timestamps };
    const ttl = await redis<number>("TTL", `inq:${id}`);
    await redis("SET", `inq:${id}`, JSON.stringify(next), "EX", ttl > 0 ? ttl : RETAIN);
    return next;
  },
  // inq:open and inq:due are id indexes, not copies of the personal record. A missing record is removed when seen.
  watchLead: async (id) => void (await redis("SADD", "inq:open", id)),
  unwatchLead: async (id) => {
    await redis("SREM", "inq:open", id);
    await redis("ZREM", "inq:due", id);
  },
  scheduleRetryAt: async (id, atMs) => {
    await redis("ZADD", "inq:due", atMs, id);
    await redis("SADD", "inq:open", id);
  },
  dueLeadIds: async (nowMs) => {
    const ids = await redis<string[] | null>("ZRANGEBYSCORE", "inq:due", "-inf", nowMs);
    return Array.isArray(ids) ? ids.map(String) : [];
  },
  openLeadIds: async () => {
    const ids = await redis<string[] | null>("SMEMBERS", "inq:open");
    return Array.isArray(ids) ? ids.map(String) : [];
  },
  claimLead: async (id, ttlSeconds) => (await redis<string | null>("SET", `lock:inq:${id}`, "1", "EX", ttlSeconds, "NX")) === "OK",
  releaseLead: async (id) => void (await redis("DEL", `lock:inq:${id}`)),
  leadLocked: async (id) => (await redis<number>("EXISTS", `lock:inq:${id}`)) === 1,
  addApplication: async (a) =>
    void (await redis("SET", `app:${at()}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify({ ...a, at: at() }), "EX", RETAIN)),
  hit: async (key, ttlSeconds) => {
    const n = await redis<number>("INCR", `rl:${key}`);
    if (n === 1) await redis("EXPIRE", `rl:${key}`, ttlSeconds);
    return n;
  },
};

export const store = REDIS ? redisStore : memStore;

// Test isolation for the in-memory store. Refuses to run against Redis so a live database cannot be wiped.
export function resetStoreForTests() {
  if (REDIS) throw new Error("refusing to reset a live Redis store");
  mem.devices.clear();
  mem.reports.clear();
  mem.pdfs.clear();
  mem.leads.length = 0;
  mem.inquiries.clear();
  mem.open.clear();
  mem.due.clear();
  mem.locks.clear();
  mem.applications.length = 0;
  mem.counters.clear();
}

export function listLeadRecordsForTests(): LeadRecord[] {
  if (REDIS) throw new Error("refusing to list a live Redis store");
  return [...mem.inquiries.values()].map((r) => structuredClone(r));
}
