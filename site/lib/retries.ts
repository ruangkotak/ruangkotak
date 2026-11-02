// Retry queue for a mini-diagnosis that was saved but did not finish.
// Change the waits here. After attempt 1, wait the first; after attempt 2, the second; after attempt 3, the third.
// The next failure tells the owner once and does not try again.
//
// Vercel Hobby only allows a cron once per day, and a function cannot sleep for five minutes inside its time limit.
// Redis cannot call the site back. When QSTASH_TOKEN and CRON_SECRET are set, Upstash QStash (same account as Redis)
// wakes /api/retries at the delay below. The daily cron is the backstop when that wake does not arrive.
import { timingSafeEqual } from "node:crypto";
import { notifyOwner } from "./notify.ts";
import { publicError } from "./public-error.ts";
import { store } from "./store.ts";
import type { LeadRecord } from "./types.ts";

export const RETRY_DELAYS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000];

// The preview and retry routes set maxDuration to 180. A lead still in progress after that, plus a minute, was killed.
export const FUNCTION_LIMIT_MS = 180_000;
export const STUCK_MARGIN_MS = 60_000;
export const STUCK_AFTER_MS = FUNCTION_LIMIT_MS + STUCK_MARGIN_MS;

const LOCK_SECONDS = 200;
const IN_PROGRESS = new Set(["received", "scraping", "report_ready"]);

type Notify = (subject: string, lines: string[]) => Promise<unknown>;

// attempts is how many processing starts have been recorded. 0 or 1 waits 5 minutes. After the last wait, null means stop.
export function retryDelayMs(attempts: number) {
  const index = Math.max(attempts, 1) - 1;
  return index < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[index] : null;
}

function sameBearer(header: string | null, secret: string) {
  const got = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

// Local dev has no VERCEL_ENV and may call the route without a secret. Every Vercel deploy must present CRON_SECRET.
export function retryAuthorized(header: string | null, env?: { CRON_SECRET?: string; VERCEL_ENV?: string }) {
  const secret = env ? env.CRON_SECRET : process.env.CRON_SECRET;
  const vercelEnv = env ? env.VERCEL_ENV : process.env.VERCEL_ENV;
  if (secret) return sameBearer(header, secret);
  return !vercelEnv;
}

function wakeOrigin() {
  if (process.env.VERCEL_ENV === "production") return "https://ruangkotak.com";
  const host = process.env.VERCEL_URL;
  if (!host) return null;
  return host.startsWith("http://") || host.startsWith("https://") ? host.replace(/\/$/, "") : `https://${host}`;
}

// Asks QStash to POST /api/retries after delayMs. No token, no secret, or no public origin: do nothing.
// The lead is already saved, and the daily cron will reach it. Never throws and never logs the token.
export async function scheduleWake(delayMs: number, dedupeKey: string) {
  const token = process.env.QSTASH_TOKEN;
  const secret = process.env.CRON_SECRET;
  const origin = wakeOrigin();
  if (!token || !secret || !origin) return false;
  const seconds = Math.max(1, Math.ceil(delayMs / 1000));
  const dedupe = dedupeKey.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 128);
  try {
    const res = await fetch(`https://qstash.upstash.io/v2/publish/${origin}/api/retries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Upstash-Delay": `${seconds}s`,
        "Upstash-Forward-Authorization": `Bearer ${secret}`,
        ...(dedupe ? { "Upstash-Deduplication-Id": dedupe } : {}),
        "Upstash-Retries": "2",
      },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("[retry] wake", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[retry] wake", publicError(err));
    return false;
  }
}

async function tell(notify: Notify | undefined, subject: string, lines: string[]) {
  try {
    await (notify ?? notifyOwner)(subject, lines);
  } catch (err) {
    console.error("[retry] notify", publicError(err));
  }
}

function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/[ \t]{2,}/g, " ").trim().slice(0, 200);
}

function ownerLines(lead: LeadRecord, error: string) {
  return [`Handle: ${oneLine(lead.platform)}:${oneLine(lead.handle)}`, `Name: ${oneLine(lead.name)}`, `Email: ${oneLine(lead.email)}`, `Error: ${oneLine(error)}`];
}

// Record the attempt and either schedule the next wait or alert the owner once.
export async function queueLeadFailure(id: string, step: string, error: unknown, deps: { now?: Date; notifyOwner?: Notify } = {}) {
  const lead = await store.getLeadRecord(id);
  if (!lead || lead.status === "emailed" || lead.retry === "no" || lead.retry === "exhausted" || lead.ownerAlertedAt) return;
  const now = deps.now ?? new Date();
  const message = publicError(error);
  const failures = [...(lead.failures ?? []), { at: now.toISOString(), step, error: message }].slice(-10);
  const delay = retryDelayMs(lead.attempts);
  if (delay == null) {
    await store.updateLeadRecord(id, {
      status: "failed",
      lastError: message,
      failures,
      retry: "exhausted",
      nextRetryAt: undefined,
      ownerAlertedAt: now.toISOString(),
      timestamps: { ...lead.timestamps, failed: now.toISOString() },
    });
    await store.unwatchLead(id);
    await tell(deps.notifyOwner, "Mini-diagnosis needs you", ownerLines(lead, message));
    return;
  }
  const nextRetryAt = new Date(now.getTime() + delay).toISOString();
  await store.updateLeadRecord(id, {
    status: "failed",
    lastError: message,
    failures,
    retry: "queued",
    nextRetryAt,
    timestamps: { ...lead.timestamps, failed: now.toISOString() },
  });
  await store.scheduleRetryAt(id, Date.parse(nextRetryAt));
  await scheduleWake(delay, `retry-${id}-${lead.attempts}`);
}

// A refusal that will not succeed on a retry: daily cap and the email send limit. One alert, then stop.
export async function closeLead(id: string, step: string, error: unknown, deps: { now?: Date; notifyOwner?: Notify } = {}) {
  const lead = await store.getLeadRecord(id);
  if (!lead || lead.status === "emailed" || lead.retry === "no" || lead.ownerAlertedAt) return;
  const now = deps.now ?? new Date();
  const message = publicError(error);
  const failures = [...(lead.failures ?? []), { at: now.toISOString(), step, error: message }].slice(-10);
  await store.updateLeadRecord(id, {
    status: "failed",
    lastError: message,
    failures,
    retry: "no",
    nextRetryAt: undefined,
    ownerAlertedAt: now.toISOString(),
    timestamps: { ...lead.timestamps, failed: now.toISOString() },
  });
  await store.unwatchLead(id);
  await tell(deps.notifyOwner, "Mini-diagnosis needs you", ownerLines(lead, message));
}

export async function reclaimStuck(now = Date.now()) {
  const queued: string[] = [];
  for (const id of await store.openLeadIds()) {
    const lead = await store.getLeadRecord(id);
    if (!lead) {
      await store.unwatchLead(id);
      continue;
    }
    if (lead.status === "emailed" || lead.retry === "no" || lead.retry === "exhausted") {
      await store.unwatchLead(id);
      continue;
    }
    if (lead.retry === "queued" || !IN_PROGRESS.has(lead.status)) continue;
    if (await store.leadLocked(id)) continue;
    const stamp = lead.timestamps[lead.status] ?? lead.updatedAt;
    if (now - Date.parse(stamp) < STUCK_AFTER_MS) continue;
    await queueLeadFailure(id, lead.status, `Stopped while ${lead.status}`, { now: new Date(now) });
    queued.push(id);
  }
  return { queued };
}

async function dueIds(now: number) {
  const candidates = new Set([...(await store.dueLeadIds(now)), ...(await store.openLeadIds())]);
  const ready: { id: string; at: number }[] = [];
  for (const id of candidates) {
    const lead = await store.getLeadRecord(id);
    if (!lead) {
      await store.unwatchLead(id);
      continue;
    }
    if (lead.retry !== "queued" || !lead.nextRetryAt) continue;
    const at = Date.parse(lead.nextRetryAt);
    if (at <= now) ready.push({ id, at });
  }
  ready.sort((a, b) => a.at - b.at);
  return ready.map((item) => item.id);
}

// One lead per call. A scrape can use most of the function limit, so a second lead waits for the next wake.
export async function runDueRetries(now = Date.now()) {
  await reclaimStuck(now);
  const due = await dueIds(now);
  const free: string[] = [];
  for (const id of due) {
    if (!(await store.leadLocked(id))) free.push(id);
  }
  if (free.length === 0) return { processed: false, waiting: 0 };
  const id = free[0];
  try {
    const { processLead } = await import("./leads.ts");
    await processLead(id, { now: new Date(now) });
  } catch (err) {
    console.error("[retry] process", publicError(err));
  }
  const still = (await dueIds(now)).filter((other) => other !== id);
  const waiting: string[] = [];
  for (const other of still) {
    if (!(await store.leadLocked(other))) waiting.push(other);
  }
  if (waiting.length > 0) await scheduleWake(1000, `retry-drain-${waiting[0]}`);
  return { processed: true, waiting: waiting.length };
}

// The open-set write is awaited. The wake is not: the creator's response must not wait on Upstash.
export async function watchForStuck(id: string, dedupeKey: string) {
  await store.watchLead(id);
  void scheduleWake(STUCK_AFTER_MS, dedupeKey);
}
