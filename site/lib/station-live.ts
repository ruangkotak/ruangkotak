// The I/O half of Station: reads the store, runs the infra probes, records beats. Pure logic is in lib/station.ts.
import registryJson from "@/data/station/registry.json";
import type { NextRequest } from "next/server";
import { notifyTelegram } from "./notify";
import { SITE } from "./site";
import { alertStore, clientStore, stationStore } from "./store";
import { dailyCounts } from "./track";
import {
  alertable, alertText, applyBeat, buildSnapshot, COOKIE, cookieScope, eventFor, keyScope, planAlerts, resolveView, withClients,
  type Beat, type ClientRecord, type Probe, type Registry, type Scope, type Snapshot, type View, type ViewQuery,
} from "./station";

/** The hand-edited registry file, without the clients added from Station. */
export const fileRegistry = registryJson as unknown as Registry;

// The live registry is the file plus active clients from Redis, read on every request (one HGETALL). Not cached, so a
// new client works the moment it is added, and a paused client or rotated link stops working the moment it changes.
export async function liveRegistry(): Promise<{ registry: Registry; clients: ClientRecord[] }> {
  try {
    const clients = await clientStore.all();
    return { registry: withClients(fileRegistry, clients), clients };
  } catch (err) {
    console.error("[station] clients unavailable, using the registry file only", err);
    return { registry: fileRegistry, clients: [] };
  }
}

/** Who is asking: an x-station-key header (scripts) or the session cookie (the page). */
export async function scopeOf(req: { headerKey?: string | null; cookie?: string | null; account?: string | null }): Promise<Scope | null> {
  const { registry } = await liveRegistry();
  return keyScope(req.headerKey, req.account, process.env, registry) ?? cookieScope(req.cookie, process.env, registry);
}

/**
 * True when the request comes from the owner: the x-station-key header, or the session cookie. Writes made with the
 * cookie must also come from Station's own page (Origin host = Host; "null" or missing is refused), on top of SameSite=Lax.
 */
export async function ownerRequest(req: NextRequest, write: boolean) {
  const headerKey = req.headers.get("x-station-key");
  const scope = await scopeOf({ headerKey, cookie: req.cookies.get(COOKIE)?.value });
  if (scope?.kind !== "owner") return false;
  if (write && !headerKey) {
    let originHost: string | null = null;
    try {
      originHost = new URL(req.headers.get("origin") ?? "").host;
    } catch {}
    if (!originHost || originHost !== req.headers.get("host")) return false;
  }
  return true;
}

export async function viewFor(scope: Scope | null, q: ViewQuery): Promise<View | null> {
  return resolveView(scope, q, (await liveRegistry()).registry);
}

// ---------- probes ----------
// Each probe has 3 seconds. Results are cached for 60 seconds per server instance so polling never hammers anyone.

const TIMEOUT = 3000;
const LAPTOP_MS = 10 * 60_000;

async function timed(url: string, init: RequestInit = {}) {
  const started = Date.now();
  const res = await fetch(url, { ...init, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT) });
  return { res, ms: Date.now() - started };
}

const why = (err: unknown) => (err instanceof Error && err.name === "TimeoutError" ? "no answer in 3s" : "unreachable");

async function probeSite(): Promise<Probe> {
  const label = "ruangkotak.com";
  try {
    const { res, ms } = await timed("https://ruangkotak.com/", { headers: { "user-agent": "ruangkotak-station/1" } });
    if (!res.ok) return { id: "site", label, status: "down", detail: `front page answered ${res.status}` };
    return ms > 2000 ? { id: "site", label, status: "degraded", detail: `front page slow: ${ms} ms` } : { id: "site", label, status: "ok", detail: `front page 200 in ${ms} ms` };
  } catch (err) {
    return { id: "site", label, status: "down", detail: `front page ${why(err)}` };
  }
}

async function probeRedis(): Promise<Probe> {
  const label = "Upstash Redis";
  if (stationStore.backend === "memory") return { id: "redis", label, status: "no-probe", detail: "no Upstash env vars: in-memory store" };
  try {
    const started = Date.now();
    const ok = await Promise.race([stationStore.ping(), new Promise<boolean>((_, no) => setTimeout(() => no(new Error("timeout")), TIMEOUT))]);
    return ok ? { id: "redis", label, status: "ok", detail: `PING in ${Date.now() - started} ms` } : { id: "redis", label, status: "degraded", detail: "PING answered oddly" };
  } catch {
    return { id: "redis", label, status: "down", detail: "PING failed" };
  }
}

async function probeApi(id: string, label: string, envName: string, url: string, headers: (token: string) => Record<string, string>): Promise<Probe> {
  const token = process.env[envName];
  if (!token) return { id, label, status: "no-probe", detail: `${envName} not set` };
  try {
    const { res, ms } = await timed(url, { headers: headers(token) });
    if (res.status === 401 || res.status === 403) return { id, label, status: "down", detail: `token refused (${res.status})` };
    if (!res.ok) return { id, label, status: "degraded", detail: `API answered ${res.status}` };
    return { id, label, status: "ok", detail: `API read in ${ms} ms` };
  } catch (err) {
    return { id, label, status: "down", detail: `API ${why(err)}` };
  }
}

// Vercel needs no token: if this code runs on Vercel, the deployment is serving, and the env says which one.
function probeVercel(): Probe {
  const env = process.env.VERCEL_ENV;
  if (!env) return { id: "vercel", label: "Vercel", status: "no-probe", detail: "not running on Vercel (local)" };
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return { id: "vercel", label: "Vercel", status: "ok", detail: `serving this page · ${env}${sha ? ` · ${sha}` : ""}` };
}

function probeLaptop(seen: Record<string, string>, now: Date): Probe {
  const at = seen.laptop;
  if (!at) return { id: "laptop", label: "Laptop", status: "no-probe", detail: "no beat from source \"laptop\" yet" };
  const age = now.getTime() - Date.parse(at);
  const mins = Math.round(age / 60_000);
  return age <= LAPTOP_MS
    ? { id: "laptop", label: "Laptop", status: "ok", detail: `last beat ${mins < 1 ? "just now" : `${mins}m ago`}` }
    : { id: "laptop", label: "Laptop", status: "down", detail: `quiet for ${mins < 120 ? `${mins}m` : `${Math.round(mins / 60)}h`}` };
}

let cache: { at: number; probes: Probe[] } | null = null;

async function probes(seen: Record<string, string>, now: Date): Promise<Probe[]> {
  if (!cache || now.getTime() - cache.at > 60_000) {
    const slow = await Promise.all([
      probeSite(),
      probeRedis(),
      probeApi("apify", "Apify", "APIFY_TOKEN", "https://api.apify.com/v2/users/me", (t) => ({ authorization: `Bearer ${t}` })),
      probeApi("notion", "Notion", "NOTION_TOKEN", "https://api.notion.com/v1/users/me", (t) => ({ authorization: `Bearer ${t}`, "notion-version": "2022-06-28" })),
    ]);
    cache = { at: now.getTime(), probes: slow };
  }
  const [site, redis, apify, notion] = cache.probes;
  // The laptop and Vercel tiles are cheap and always fresh.
  return [site, redis, apify, probeVercel(), notion, probeLaptop(seen, now)];
}

// ---------- reads and writes ----------

export async function getSnapshot(view: View, now = new Date()): Promise<Snapshot> {
  const { registry } = await liveRegistry();
  const [runs, events, gates, seen] = await Promise.all([
    stationStore.runs(registry.jobs.map((j) => j.id)),
    stationStore.events(500),
    stationStore.gates(),
    stationStore.seen(),
  ]);
  const wantsFunnel = view.account === "all" || registry.accounts.find((a) => a.id === view.account)?.funnel === "site";
  const [infra, funnel] = await Promise.all([
    view.mode === "owner" ? probes(seen, now) : Promise.resolve([]),
    wantsFunnel ? dailyCounts(7).catch((err) => (console.error("[station] funnel", err), "error" as const)) : Promise.resolve(null),
  ]);
  const snap = buildSnapshot({ registry, view, runs, events, gates, probes: infra, funnel, now });
  return view.mode === "owner" ? { ...snap, alerts: telegramReady() } : snap;
}

export async function recordBeat(beat: Beat, registry: Registry, now = new Date()) {
  if (beat.kind === "job") {
    const runs = (await stationStore.runs([beat.jobId]))[beat.jobId] ?? [];
    await stationStore.setRuns(beat.jobId, applyBeat(runs, beat, now));
  } else {
    await stationStore.setGate(`${beat.gate}:${beat.account}`, { waiting: beat.waiting, oldestAt: beat.oldestAt, at: now.toISOString() });
  }
  await stationStore.addEvent(eventFor(beat, registry, now));
  if (beat.source) await stationStore.markSeen(beat.source, now.toISOString());
}

// ---------- Telegram alerts ----------

export const telegramReady = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

/**
 * Compares what needs you now with what was already announced and sends one Telegram message about the difference.
 * Runs after every beat, when the owner has Station open, and once a day from Vercel cron. At most once a minute
 * (a Redis lock), so a burst of beats sends one message. Never throws.
 */
export async function checkAlerts(): Promise<{ sent: boolean; reason?: string }> {
  try {
    if (!telegramReady()) return { sent: false, reason: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set" };
    const lockSeconds = Number(process.env.STATION_ALERT_LOCK_SECONDS ?? 60) || 60; // tests shorten it
    if (!(await alertStore.lock("alerts", lockSeconds))) return { sent: false, reason: "checked moments ago" };
    const now = new Date();
    const [snap, seen, prev] = await Promise.all([getSnapshot({ mode: "owner", account: "all" }, now), stationStore.seen(), alertStore.alerted()]);
    const plan = planAlerts(alertable(snap.needsYou, seen.laptop, now), prev, now);
    const text = alertText(plan, `${SITE}/station#alerts`);
    if (!text) {
      if (JSON.stringify(plan.next) !== JSON.stringify(prev)) await alertStore.setAlerted(plan.next);
      return { sent: false, reason: "nothing new" };
    }
    // Only remember what was announced if the message got through, so a Telegram hiccup is retried next time.
    if (await notifyTelegram(text)) {
      await alertStore.setAlerted(plan.next);
      return { sent: true };
    }
    return { sent: false, reason: "Telegram refused the message (see the server log)" };
  } catch (err) {
    console.error("[station] alerts", err);
    return { sent: false, reason: "check failed (see the server log)" };
  }
}
