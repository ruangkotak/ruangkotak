// Key-value store behind the preview limit, leads and applications.
// Live: Upstash Redis over its REST API when UPSTASH_REDIS_REST_URL/TOKEN are set (required on Vercel, where memory resets per instance).
// Local: in-memory, resets on restart.
import { withoutSample } from "./funnel";
import type { Alerted, ClientRecord, GateReading, Run, StationEvent } from "./station";
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
  // Reads counters without changing them; a missing bucket reads as 0.
  counts: async (keys: string[]) => keys.map((k) => mem.counters.get(k) ?? 0),
  // Every saved report, for the owner's private review list. Read-only.
  allReports: async () => [...mem.reports.values()],
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
  counts: async (keys) =>
    keys.length ? (await redis<(string | null)[]>("MGET", ...keys.map((k) => `rl:${k}`))).map((v) => Number(v ?? 0)) : [],
  allReports: async () => {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await redis<[string, string[]]>("SCAN", cursor, "MATCH", "rep:*", "COUNT", 200);
      keys.push(...batch);
      cursor = next;
    } while (cursor !== "0" && keys.length < 1000);
    const out: Report[] = [];
    for (let i = 0; i < keys.length; i += 50) {
      const vals = await redis<(string | null)[]>("MGET", ...keys.slice(i, i + 50));
      for (const v of vals) if (v) out.push(JSON.parse(v) as Report);
    }
    return out;
  },
};

const base = REDIS ? redisStore : memStore;
// Every reader (preview route, report page, download) goes through here, so a saved sample report is never served as real.
export const store: typeof base = { ...base, getReport: async (id) => withoutSample(await base.getReport(id)) };

// ---------- Station (/station): job runs, gate readings, the event log, last-seen sources ----------
// Operational data only, never personal data (beat messages are trimmed and must not carry handles or contacts).
// Keys: st:runs:<jobId> JSON list of the last runs, st:log capped list of events (newest first),
// st:gates hash "<gate>:<account>" -> reading, st:seen hash source -> ISO time. All expire 90 days after the last write.

const ST_KEEP = 90 * 24 * 60 * 60;
const ST_LOG = 500;

type StationMem = { runs: Map<string, Run[]>; log: StationEvent[]; gates: Map<string, GateReading>; seen: Map<string, string> };
const gs = globalThis as unknown as { __rkStation?: StationMem };
const smem: StationMem = (gs.__rkStation ??= { runs: new Map(), log: [], gates: new Map(), seen: new Map() });

const pairs = <T>(flat: string[] | null, read: (v: string) => T) => {
  const out: Record<string, T> = {};
  for (let i = 0; flat && i < flat.length; i += 2) out[flat[i]] = read(flat[i + 1]);
  return out;
};

export const stationStore = REDIS
  ? {
      backend: "redis" as const,
      ping: async () => (await redis<string>("PING")) === "PONG",
      runs: async (jobIds: string[]): Promise<Record<string, Run[]>> => {
        if (!jobIds.length) return {};
        const vals = await redis<(string | null)[]>("MGET", ...jobIds.map((id) => `st:runs:${id}`));
        return Object.fromEntries(jobIds.map((id, i) => [id, parse<Run[]>(vals[i]) ?? []]));
      },
      setRuns: async (jobId: string, runs: Run[]) => void (await redis("SET", `st:runs:${jobId}`, JSON.stringify(runs), "EX", ST_KEEP)),
      events: async (limit: number) => (await redis<string[]>("LRANGE", "st:log", 0, limit - 1)).map((s) => JSON.parse(s) as StationEvent),
      addEvent: async (e: StationEvent) => {
        await redis("LPUSH", "st:log", JSON.stringify(e));
        await redis("LTRIM", "st:log", 0, ST_LOG - 1);
        await redis("EXPIRE", "st:log", ST_KEEP);
      },
      gates: async () => pairs(await redis<string[] | null>("HGETALL", "st:gates"), (v) => JSON.parse(v) as GateReading),
      setGate: async (key: string, g: GateReading) => {
        await redis("HSET", "st:gates", key, JSON.stringify(g));
        await redis("EXPIRE", "st:gates", ST_KEEP);
      },
      seen: async () => pairs(await redis<string[] | null>("HGETALL", "st:seen"), (v) => v),
      markSeen: async (source: string, at: string) => {
        await redis("HSET", "st:seen", source, at);
        await redis("EXPIRE", "st:seen", ST_KEEP);
      },
    }
  : {
      backend: "memory" as const,
      ping: async () => true,
      runs: async (jobIds: string[]): Promise<Record<string, Run[]>> => Object.fromEntries(jobIds.map((id) => [id, smem.runs.get(id) ?? []])),
      setRuns: async (jobId: string, runs: Run[]) => void smem.runs.set(jobId, runs),
      events: async (limit: number) => smem.log.slice(0, limit),
      addEvent: async (e: StationEvent) => void (smem.log = [e, ...smem.log].slice(0, ST_LOG)),
      gates: async () => Object.fromEntries(smem.gates),
      setGate: async (key: string, g: GateReading) => void smem.gates.set(key, g),
      seen: async () => Object.fromEntries(smem.seen),
      markSeen: async (source: string, at: string) => void smem.seen.set(source, at),
    };

// ---------- Station: applications for the brief sweep ----------
// Monthly applications created after `since`, oldest first, for the owner's reply checklist. Only what is needed to
// review a brief and reply with a quote leaves here: no name, contact details or consent record.
export type BriefSummary = { id: string; at: string; handle: string; platform: string; niche: string; views: string; goal: string };

const brief = (id: string, a: Record<string, string>): BriefSummary => ({
  id, at: a.at, handle: a.handle ?? "", platform: a.platform ?? "", niche: a.niche ?? "", views: a.views ?? "", goal: a.goal ?? "",
});

export async function applicationsSince(since: string, limit = 200): Promise<BriefSummary[]> {
  if (!REDIS) return mem.applications.filter((a) => a.at > since).slice(0, limit).map((a) => brief(`mem-${a.at}`, a));
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis<[string, string[]]>("SCAN", cursor, "MATCH", "app:*", "COUNT", 200);
    keys.push(...batch.filter((k) => k.slice(4) > since)); // app:<ISO time>:<rand>, so key order is time order
    cursor = next;
  } while (cursor !== "0" && keys.length < 5000);
  keys.sort();
  const picked = keys.slice(0, limit);
  const out: BriefSummary[] = [];
  for (let i = 0; i < picked.length; i += 50) {
    const vals = await redis<(string | null)[]>("MGET", ...picked.slice(i, i + 50));
    vals.forEach((v, j) => v && out.push(brief(picked[i + j].slice(4), JSON.parse(v))));
  }
  return out;
}

// ---------- Station: clients added from the Clients tab ----------
// st:clients hash, id -> ClientRecord. Business records, kept while the client is with us: no expiry. Only a hash of each
// client's key is stored.
const gc = globalThis as unknown as { __rkClients?: Map<string, ClientRecord> };
const cmem: Map<string, ClientRecord> = (gc.__rkClients ??= new Map());

export const clientStore = REDIS
  ? {
      all: async (): Promise<ClientRecord[]> => {
        const flat = await redis<string[] | null>("HGETALL", "st:clients");
        const out: ClientRecord[] = [];
        for (let i = 0; flat && i < flat.length; i += 2) out.push(JSON.parse(flat[i + 1]) as ClientRecord);
        return out;
      },
      save: async (c: ClientRecord) => void (await redis("HSET", "st:clients", c.id, JSON.stringify(c))),
      remove: async (id: string) => void (await redis("HDEL", "st:clients", id)),
    }
  : {
      all: async (): Promise<ClientRecord[]> => [...cmem.values()],
      save: async (c: ClientRecord) => void cmem.set(c.id, c),
      remove: async (id: string) => void cmem.delete(id),
    };

// ---------- Station: Telegram alerts ----------
// st:alerted = JSON of what has been announced (key -> wording, time). st:lock:<name> = a short lock so two requests
// arriving together never send the same alert twice.
const ga = globalThis as unknown as { __rkAlerts?: { alerted: Alerted; locks: Map<string, number> } };
const amem = (ga.__rkAlerts ??= { alerted: {}, locks: new Map() });

export const alertStore = REDIS
  ? {
      alerted: async (): Promise<Alerted> => parse<Alerted>(await redis<string | null>("GET", "st:alerted")) ?? {},
      setAlerted: async (a: Alerted) => void (await redis("SET", "st:alerted", JSON.stringify(a))),
      /** true when this caller got the lock (held for `seconds`). */
      lock: async (name: string, seconds: number) => (await redis<string | null>("SET", `st:lock:${name}`, "1", "EX", seconds, "NX")) === "OK",
    }
  : {
      alerted: async (): Promise<Alerted> => amem.alerted,
      setAlerted: async (a: Alerted) => void (amem.alerted = a),
      lock: async (name: string, seconds: number) => {
        const until = amem.locks.get(name) ?? 0;
        if (until > Date.now()) return false;
        amem.locks.set(name, Date.now() + seconds * 1000);
        return true;
      },
    };
