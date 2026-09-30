// Key-value store behind the preview limit, leads and applications.
// Live: Upstash Redis over its REST API when UPSTASH_REDIS_REST_URL/TOKEN are set (required on Vercel, where memory resets per instance).
// Local: in-memory, resets on restart.
import type { Lead, Report } from "./types";

type StoredLead = Lead & { reportId: string; at: string };

type Mem = {
  devices: Map<string, { handle: string; at: string }>; // device key -> first handle previewed
  reports: Map<string, Report>;
  pdfs: Map<string, Uint8Array>;
  leads: StoredLead[];
  applications: Record<string, string>[];
  counters: Map<string, number>;
};

const g = globalThis as unknown as { __rk?: Mem };
const mem: Mem = (g.__rk ??= { devices: new Map(), reports: new Map(), pdfs: new Map(), leads: [], applications: [], counters: new Map() });
mem.pdfs ??= new Map(); // a dev server's store from before pdfs existed

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
  saveReport: async (r: Report) => void mem.reports.set(r.id, r),
  getReport: async (id: string) => mem.reports.get(id) ?? null,
  getPdf: async (id: string, version: string) => mem.pdfs.get(`${version}:${id}`) ?? null,
  savePdf: async (id: string, version: string, pdf: Uint8Array) => void mem.pdfs.set(`${version}:${id}`, pdf),
  isUnlocked: async (reportId: string) => mem.leads.some((l) => l.reportId === reportId),
  addLead: async (reportId: string, lead: Lead) => void mem.leads.push({ ...lead, reportId, at: at() }),
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

// Keys: dev:<device> first handle, rep:<id> report, pdf:<version>:<id> that report's PDF (base64), lead:<id> leads for that report, app:<time>:<rand> one application,
// rl:<bucket> counters. No all-time lists: list items can't expire one by one; find leads and applications with SCAN.
const redisStore: typeof memStore = {
  deviceHandle: async (key) => parse<{ handle: string }>(await redis<string | null>("GET", `dev:${key}`))?.handle ?? null,
  setDeviceHandle: async (key, handle) => void (await setOnce(`dev:${key}`, JSON.stringify({ handle, at: at() }))),
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
  addApplication: async (a) =>
    void (await redis("SET", `app:${at()}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify({ ...a, at: at() }), "EX", RETAIN)),
  hit: async (key, ttlSeconds) => {
    const n = await redis<number>("INCR", `rl:${key}`);
    if (n === 1) await redis("EXPIRE", `rl:${key}`, ttlSeconds);
    return n;
  },
};

export const store = REDIS ? redisStore : memStore;
