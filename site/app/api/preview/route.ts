import { FUNNEL_LIVE, funnelClosed } from "@/lib/funnel";
import { cookies, headers } from "next/headers";
import { analyze } from "@/lib/analyze";
import { notifyOwner, sendReportLink } from "@/lib/notify";
import { MOCK, fetchAccount, normaliseHandle, reportIdFor } from "@/lib/source";
import { store } from "@/lib/store";
import { CONSENT, consentRecord } from "@/lib/legal";
import type { Lead, Platform } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9\s-]{9,15}$/;

// The same body goes back for a blocked device and for a real failure, so the reason never leaks.
const unavailable = () => Response.json({ ok: false }, { status: 200 });

type Bad = "name" | "email" | "whatsapp" | "consent";

function readLead(body: Record<string, unknown> | null, ip: string): { lead: Lead } | { bad: Bad } {
  const name = String(body?.name ?? "").trim().slice(0, 60);
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 120);
  const whatsapp = String(body?.whatsapp ?? "").trim();
  if (!name) return { bad: "name" };
  if (!EMAIL.test(email)) return { bad: "email" };
  if (whatsapp && !PHONE.test(whatsapp)) return { bad: "whatsapp" };
  // Both required boxes must be ticked; the marketing box is optional and never pre-ticked.
  if (body?.consentNotice !== true || body?.consentOwner !== true) return { bad: "consent" };
  const marketing = body?.consentMarketing === true;
  const accepted = [CONSENT.notice, CONSENT.owner, ...(marketing ? [CONSENT.marketing] : [])];
  return { lead: { name, email, whatsapp, marketing, consent: consentRecord(accepted, ip) } };
}

// One request per creator: contact details first, then the scrape. No valid email, no scrape and no model cost.
export async function POST(req: Request) {
  if (!FUNNEL_LIVE) return funnelClosed();
  const body = await req.json().catch(() => null);
  const platform: Platform = body?.platform === "instagram" ? "instagram" : "tiktok";
  const handle = normaliseHandle(String(body?.handle ?? ""));
  if (!handle) return Response.json({ ok: false, invalid: "handle" }, { status: 400 });
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const country = h.get("x-vercel-ip-country") ?? "unknown";
  const read = readLead(body, ip);
  if ("bad" in read) return Response.json({ ok: false, invalid: read.bad }, { status: 400 });
  const { lead } = read;

  // Device identity: an httpOnly cookie plus the id the browser keeps in localStorage.
  // IP is recorded for the owner alert but not used to block, because Malaysian mobile networks share IPs (CGNAT).
  const jar = await cookies();
  const cookieId = jar.get("rk_dev")?.value ?? crypto.randomUUID();
  const clientId = typeof body?.deviceId === "string" ? body.deviceId.slice(0, 64) : "";
  const who = `${lead.name} <${lead.email}>${lead.whatsapp ? `, WhatsApp ${lead.whatsapp}` : ""}`;

  const keys = [`c:${cookieId}`, clientId && `d:${clientId}`].filter(Boolean) as string[];
  for (const k of keys) {
    const prev = await store.deviceHandle(k);
    if (prev && prev !== `${platform}:${handle}`) {
      await notifyOwner("Preview blocked: second account on one device", [
        `First: ${prev}`,
        `Tried: ${platform}:${handle}`,
        `Contact: ${who}`,
        `Device: ${k}`,
        `IP: ${ip} (${country})`,
        `Time: ${new Date().toISOString()}`,
      ]);
      return unavailable();
    }
  }

  try {
    const id = await reportIdFor(platform, handle);
    const report = (await store.getReport(id)) ?? analyze(id, await fetchAccount(platform, handle), MOCK);
    await store.saveReport(report);
    await store.addLead(id, lead);
    for (const k of keys) await store.setDeviceHandle(k, `${platform}:${handle}`);

    const path = `/r/${id}`;
    await Promise.all([
      notifyOwner("New lead: mini-diagnosis", [
        `Account: ${report.handle} (${report.platform})`,
        `Contact: ${who}`,
        `Follow-ups allowed: ${lead.marketing ? "yes" : "NO, send the report only"}`,
        `Report: ${path}`,
      ]),
      sendReportLink(lead, report.handle, new URL(path, req.url).toString()),
    ]);

    jar.set("rk_dev", cookieId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
    return Response.json({ ok: true, url: path });
  } catch (err) {
    console.error("[preview]", err);
    await notifyOwner("Preview failed", [`Account: ${platform}:${handle}`, `Contact: ${who}`, `Error: ${String(err)}`]);
    return unavailable();
  }
}
