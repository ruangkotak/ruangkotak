import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { consentRecord, ONBOARD_CONSENT } from "@/lib/legal";
import { notifyOwner } from "@/lib/notify";
import { BRAND_REQUESTS_MAX, cleanBrandRequest, dealLabel } from "@/lib/station";
import { brandRequestStore, store } from "@/lib/store";

// The public /onboarding form: a brand offering @alanazizreview a job. The request waits on the KNOX board
// (Clients tab → Brand requests) until the owner accepts or declines it. Nothing is sent to the brand from here.

const PER_IP_PER_HOUR = 5;
const PER_DAY = 50;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  // A hidden field people never see. Bots fill it; answer as if it worked so they do not retry.
  if (body && typeof body.website === "string" && body.website.trim()) return Response.json({ ok: true });
  const v = cleanBrandRequest(body);
  if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });
  if (body?.consent !== true) return Response.json({ ok: false, error: "Tick the consent box to send." }, { status: 400 });

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  try {
    const ipHits = await store.hit(`onboard:ip:${ip}`, 3600);
    const dayHits = await store.hit(`onboard:day:${new Date().toISOString().slice(0, 10)}`, 86400);
    if (ipHits > PER_IP_PER_HOUR || dayHits > PER_DAY || (await brandRequestStore.count()) >= BRAND_REQUESTS_MAX)
      return Response.json({ ok: false, error: "Too many requests right now. Please email us instead." }, { status: 429 });
    const c = consentRecord([ONBOARD_CONSENT], ip);
    const q = { id: randomUUID(), at: c.at, ...v.value, consentVersion: c.version, consentAt: c.at, consentIp: c.ip };
    await brandRequestStore.add(q);
    await notifyOwner("New brand request", [
      `brand: ${q.brand}`, `job: ${dealLabel(q.deal)}: ${q.what}`, `fee offered: ${q.offer ? `RM${q.offer}` : "none"}`,
      `reply to: ${q.reach}${q.name ? ` (${q.name})` : ""}`, "Accept or decline on KNOX: Clients tab → Brand requests",
    ]);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[onboarding]", err);
    return Response.json({ ok: false, error: "Something went wrong on our side. Please try again or email us." }, { status: 503 });
  }
}
