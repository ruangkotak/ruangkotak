import { funnelClosed, previewOpen } from "@/lib/funnel";
import { acceptMiniDiagnosis, processLead } from "@/lib/leads";
import { notifyOwner } from "@/lib/notify";
import { publicError } from "@/lib/public-error";
import { cookies, headers } from "next/headers";
import { after } from "next/server";

// The creator is answered as soon as the lead is stored. Scrape, tagging, the report and the
// creator email run in after(), which keeps this invocation alive until they finish or maxDuration
// is hit. On Vercel that budget covers the background work too. A kill at the time limit leaves
// the lead on scraping or report_ready; /api/retries picks that up and tries again later.
export const maxDuration = 180;

// Production emails always use the public site, so a forged Host cannot put another origin in the link.
function reportOrigin(req: Request) {
  if (process.env.VERCEL_ENV === "production") return "https://ruangkotak.com";
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  if (!previewOpen()) return funnelClosed();
  try {
    const body = await req.json().catch(() => null);
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
    const country = h.get("x-vercel-ip-country") ?? "unknown";
    const jar = await cookies();
    const raw = jar.get("rk_dev")?.value ?? "";
    const cookieId = /^[A-Za-z0-9-]{8,64}$/.test(raw) ? raw : crypto.randomUUID();
    const result = await acceptMiniDiagnosis({ body, ip, country, cookieId, origin: reportOrigin(req) });
    if (result.kind === "invalid") return Response.json({ ok: false, invalid: result.field }, { status: 400 });
    if (result.kind === "unavailable") return Response.json({ ok: false });

    after(() => processLead(result.lead.id));
    jar.set("rk_dev", cookieId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[preview]", publicError(err));
    await notifyOwner("Preview failed", [`Error: ${publicError(err)}`]);
    return Response.json({ ok: false });
  }
}
