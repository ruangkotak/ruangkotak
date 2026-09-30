// Key-value store behind the preview limit, leads and applications.
// Live: Upstash Redis over its REST API when UPSTASH_REDIS_REST_URL/TOKEN are set (required on Vercel, where memory resets per instance).
// Local: in-memory, resets on restart.
import type { Lead, Report } from "./types";

type StoredLead = Lead & { reportId: string; at: string };

type Mem = {
  devices: Map<string, { handle: string; at: string }>; // device key -> first handle previewed
  reports: Map<string, Report>;
  leads: StoredLead[];
  applications: Record<string, string>[];
  counters: Map<string, number>;
};

const g = globalThis as unknown as { __rk?: Mem };
const mem: Mem = (g.__rk ??= { devices: new Map(), reports: new Map(), leads: [], applications: [], counters: new Map() });

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

// Keys: dev:<device> first handle, rep:<id> report, lead:<id> leads for that report, leads / apps all-time lists, rl:<bucket> counters.
const redisStore: typeof memStore = {
  deviceHandle: async (key) => parse<{ handle: string }>(await redis<string | null>("GET", `dev:${key}`))?.handle ?? null,
  setDeviceHandle: async (key, handle) => void (await redis("SET", `dev:${key}`, JSON.stringify({ handle, at: at() }))),
  saveReport: async (r) => void (await redis("SET", `rep:${r.id}`, JSON.stringify(r))),
  getReport: async (id) => parse<Report>(await redis<string | null>("GET", `rep:${id}`)),
  isUnlocked: async (reportId) => (await redis<number>("EXISTS", `lead:${reportId}`)) === 1,
  addLead: async (reportId, lead) => {
    const row = JSON.stringify({ ...lead, reportId, at: at() });
    await redis("RPUSH", `lead:${reportId}`, row);
    await redis("RPUSH", "leads", row);
  },
  addApplication: async (a) => void (await redis("RPUSH", "apps", JSON.stringify({ ...a, at: at() }))),
  hit: async (key, ttlSeconds) => {
    const n = await redis<number>("INCR", `rl:${key}`);
    if (n === 1) await redis("EXPIRE", `rl:${key}`, ttlSeconds);
    return n;
  },
};

export const store = REDIS ? redisStore : memStore;
