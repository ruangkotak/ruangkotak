// Relative imports keep the .ts extension so `node --test` can load this file. Next resolves them too.
// Saves a mini-diagnosis request before any scraping, then finishes the report after the HTTP response.
// The route calls acceptMiniDiagnosis, answers the creator, and schedules processLead with next/server after().
import { analyze } from "./analyze.ts";
import { consentRecord, CONSENT } from "./legal.ts";
import { notifyOwner, sendReportLink } from "./notify.ts";
import { publicError } from "./public-error.ts";
import { normaliseHandle, reportIdFor } from "./report-id.ts";
import { REDIS, store } from "./store.ts";
import type { AccountData, Lead, LeadRecord, LeadStatus, Platform } from "./types.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9\s-]{9,15}$/;

// Cost caps on fresh scrapes. Per IP is loose because Malaysian mobile networks share IPs (CGNAT).
const PER_IP_PER_HOUR = 10;
export const SCRAPES_PER_DAY = 10;

// The report email goes to whatever address was typed, so cap sends to stop the sender being used on strangers.
const EMAILS_PER_ADDRESS_PER_DAY = 2;
const EMAILS_PER_IP_PER_HOUR = 10;

// The bucket name is the UTC date. Malaysia is UTC+8, so this cap resets at 08:00 there.
export function scrapeDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

type Bad = "name" | "email" | "whatsapp" | "consent";
type Notify = (subject: string, lines: string[]) => Promise<unknown>;
type FetchAccount = (platform: Platform, handle: string) => Promise<AccountData>;
type SendLink = (to: { name: string; email: string }, handle: string, url: string) => Promise<boolean>;

export type AcceptInput = {
  body: Record<string, unknown> | null;
  ip: string;
  country: string;
  cookieId: string;
  origin: string;
  now?: Date;
};

export type AcceptResult =
  | { kind: "invalid"; field: Bad | "handle" }
  | { kind: "unavailable"; lead: LeadRecord | null }
  | { kind: "accepted"; lead: LeadRecord };

const contactLine = (lead: { name: string; email: string; whatsapp: string }) =>
  `${lead.name} <${lead.email}>${lead.whatsapp ? `, WhatsApp ${lead.whatsapp}` : ""}`;

async function tell(notify: Notify | undefined, subject: string, lines: string[]) {
  try {
    await (notify ?? notifyOwner)(subject, lines);
  } catch (err) {
    console.error("[preview] notify", publicError(err));
  }
}

function cleanOrigin(origin: string) {
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    /* use the public site */
  }
  return "https://ruangkotak.com";
}

async function tryReportId(platform: Platform, handle: string) {
  try {
    return await reportIdFor(platform, handle);
  } catch (err) {
    console.error("[preview] report id", publicError(err));
    return null;
  }
}

function draft(input: AcceptInput, fields: Omit<LeadRecord, "id" | "createdAt" | "updatedAt" | "timestamps" | "status" | "attempts" | "origin"> & { status: LeadStatus; lastError?: string }): LeadRecord {
  const now = (input.now ?? new Date()).toISOString();
  const timestamps: LeadRecord["timestamps"] = { received: now };
  if (fields.status !== "received") timestamps[fields.status] = now;
  return {
    ...fields,
    id: crypto.randomUUID(),
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    timestamps,
    origin: cleanOrigin(input.origin),
  };
}

// One request per creator: contact details first. No valid email, no record and no scrape.
export async function acceptMiniDiagnosis(input: AcceptInput, deps: { notifyOwner?: Notify } = {}): Promise<AcceptResult> {
  const body = input.body;
  const platform: Platform = body?.platform === "instagram" ? "instagram" : "tiktok";
  const handle = normaliseHandle(String(body?.handle ?? ""));
  if (!handle) return { kind: "invalid", field: "handle" };

  const name = String(body?.name ?? "").trim().slice(0, 60);
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 120);
  const whatsapp = String(body?.whatsapp ?? "").trim();
  const bad: Bad | null = !name ? "name" : !EMAIL.test(email) ? "email" : whatsapp && !PHONE.test(whatsapp) ? "whatsapp" : null;
  if (bad) return { kind: "invalid", field: bad };
  if (body?.consentNotice !== true || body?.consentOwner !== true) return { kind: "invalid", field: "consent" };

  const marketing = body?.consentMarketing === true;
  const lead: Lead = {
    name,
    email,
    whatsapp,
    marketing,
    consent: consentRecord([CONSENT.notice, CONSENT.owner, ...(marketing ? [CONSENT.marketing] : [])], input.ip),
  };
  const clientId = typeof body?.deviceId === "string" ? body.deviceId.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64) : "";
  const deviceKeys = [`c:${input.cookieId}`, clientId && `d:${clientId}`].filter(Boolean) as string[];
  const who = contactLine(lead);
  const account = `${platform}:${handle}`;

  // Without Redis every serverless instance keeps its own counters, so the daily cap would not hold.
  // Refuse before any scrape. The lead cannot be stored either; the owner alert is the record.
  if (process.env.VERCEL_ENV === "production" && !REDIS) {
    await tell(deps.notifyOwner, "Preview failed", [`Account: ${account}`, `Contact: ${who}`, "Error: Lead store is not configured"]);
    return { kind: "unavailable", lead: null };
  }

  const save = async (record: LeadRecord) => {
    try {
      return await store.saveLeadRecord(record);
    } catch (err) {
      console.error("[preview] save lead", publicError(err));
      await tell(deps.notifyOwner, "Preview failed", [`Account: ${account}`, `Contact: ${who}`, `Error: ${publicError(err)}`]);
      return null;
    }
  };

  for (const key of deviceKeys) {
    const prev = await store.deviceHandle(key);
    if (prev && prev !== account) {
      // Same response as a real failure, so the reason never leaks. The record still exists for the owner.
      const saved = await save(draft(input, { ...lead, platform, handle, reportId: await tryReportId(platform, handle), status: "failed", lastError: "Second account on this device", deviceKeys, country: input.country }));
      if ((await store.hit(`blocked:${key}`, 3600)) === 1) {
        await tell(deps.notifyOwner, "Preview blocked: second account on one device", [
          `First: ${prev}`,
          `Tried: ${account}`,
          `Contact: ${who}`,
          `Device: ${key}`,
          `IP: ${input.ip} (${input.country})`,
          `Time: ${new Date().toISOString()}`,
          ...(saved ? [`Lead: ${saved.id}`] : []),
        ]);
      }
      return { kind: "unavailable", lead: saved };
    }
  }

  const reportId = await tryReportId(platform, handle);
  const cached = reportId ? await store.getReport(reportId) : null;
  // A missing report id means we cannot store a report, so processLead fails before spending a scrape.
  if (!cached && reportId) {
    const now = input.now ?? new Date();
    const ipHits = await store.hit(`ip:${input.ip}`, 3600);
    const dayHits = await store.hit(`day:${scrapeDayKey(now)}`, 86400);
    if (ipHits > PER_IP_PER_HOUR || dayHits > SCRAPES_PER_DAY) {
      const saved = await save(draft(input, { ...lead, platform, handle, reportId, status: "failed", lastError: "Scrape limit reached", deviceKeys, country: input.country }));
      await tell(deps.notifyOwner, "Preview held: scrape limit reached", [
        `Account: ${account}`,
        `Contact: ${who}`,
        `IP: ${input.ip} (${input.country}), ${ipHits} this hour; ${dayHits} scrapes today`,
        ...(saved ? [`Lead: ${saved.id}`] : []),
      ]);
      return { kind: "unavailable", lead: saved };
    }
  }

  const saved = await save(draft(input, { ...lead, platform, handle, reportId, status: "received", deviceKeys, country: input.country }));
  if (!saved) return { kind: "unavailable", lead: null };
  await tell(deps.notifyOwner, "New lead: mini-diagnosis", [
    `Account: ${account}`,
    `Contact: ${who}`,
    `Follow-ups allowed: ${lead.marketing ? "yes" : "NO, send the report only"}`,
    ...(reportId ? [`Report: /r/${reportId}`] : ["Report: id unavailable"]),
    `Lead: ${saved.id}`,
    "Status: received",
    `IP: ${input.ip} (${input.country})`,
  ]);
  return { kind: "accepted", lead: saved };
}

async function mark(id: string, status: LeadStatus, extra: Partial<LeadRecord> = {}) {
  const cur = await store.getLeadRecord(id);
  if (!cur) return null;
  const now = new Date().toISOString();
  return store.updateLeadRecord(id, { ...extra, status, timestamps: { ...cur.timestamps, [status]: now } });
}

// Scrape, tag, store the report, email the creator. Safe to call after the response: it records its own outcome.
export async function processLead(id: string, deps: { fetchAccount?: FetchAccount; sendReportLink?: SendLink; notifyOwner?: Notify } = {}) {
  const lead = await store.getLeadRecord(id);
  if (!lead || lead.status === "failed" || lead.status === "emailed") return;
  const send = deps.sendReportLink ?? sendReportLink;
  try {
    let current = lead;
    if (current.status !== "report_ready") {
      const started = await mark(id, "scraping", { attempts: current.attempts + 1 });
      if (!started) return;
      current = started;
      const reportId = current.reportId ?? (await reportIdFor(current.platform, current.handle));
      let report = await store.getReport(reportId);
      if (!report) {
        const fetchAccount = deps.fetchAccount ?? (await import("./source.ts")).fetchAccount;
        const account = await fetchAccount(current.platform, current.handle);
        const { attachCovers } = await import("./covers.ts");
        report = await attachCovers(analyze(reportId, account, !process.env.APIFY_TOKEN));
        await store.saveReport(report);
      }
      const contact: Lead = { name: current.name, email: current.email, whatsapp: current.whatsapp, marketing: current.marketing, consent: current.consent };
      await store.addLead(reportId, contact);
      for (const key of current.deviceKeys) await store.setDeviceHandle(key, `${current.platform}:${current.handle}`);
      const ready = await mark(id, "report_ready", { reportId });
      if (!ready) return;
      current = ready;
    }

    const reportId = current.reportId;
    if (!reportId) throw new Error("Report id is missing");
    const addressHits = await store.hit(`mail:to:${current.email}`, 86400);
    const mailIpHits = await store.hit(`mail:ip:${current.consent.ip}`, 3600);
    if (addressHits > EMAILS_PER_ADDRESS_PER_DAY || mailIpHits > EMAILS_PER_IP_PER_HOUR) {
      const lastError = "Report email skipped: send limit reached";
      await mark(id, "failed", { lastError });
      await tell(deps.notifyOwner, "Preview failed", [`Account: ${current.platform}:${current.handle}`, `Contact: ${contactLine(current)}`, `Lead: ${id}`, `Error: ${lastError}`]);
      return;
    }
    const report = await store.getReport(reportId);
    const sent = await send({ name: current.name, email: current.email }, report?.handle ?? `@${current.handle}`, `${current.origin}/r/${reportId}`);
    if (!sent) {
      const lastError = "Report email was not accepted";
      await mark(id, "failed", { lastError });
      await tell(deps.notifyOwner, "Preview failed", [`Account: ${current.platform}:${current.handle}`, `Contact: ${contactLine(current)}`, `Lead: ${id}`, `Error: ${lastError}`]);
      return;
    }
    await mark(id, "emailed");
  } catch (err) {
    const lastError = publicError(err);
    try {
      await mark(id, "failed", { lastError });
    } catch (saveErr) {
      console.error("[preview] mark failed", publicError(saveErr));
    }
    await tell(deps.notifyOwner, "Preview failed", [`Account: ${lead.platform}:${lead.handle}`, `Contact: ${contactLine(lead)}`, `Lead: ${id}`, `Error: ${lastError}`]);
  }
}
