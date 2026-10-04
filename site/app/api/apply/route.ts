import { FUNNEL_LIVE, funnelClosed } from "@/lib/funnel";
import { notifyOwner } from "@/lib/notify";
import { headers } from "next/headers";
import { APPLY_CONSENT, consentRecord } from "@/lib/legal";
import { store } from "@/lib/store";

const FIELDS = ["name", "handle", "platform", "niche", "views", "goal", "contact"] as const;

const APPLY_PER_IP_PER_HOUR = 5;
const APPLY_PER_DAY = 100;

export async function POST(req: Request) {
  if (!FUNNEL_LIVE) return funnelClosed();
  const body = await req.json().catch(() => null);
  const a = Object.fromEntries(FIELDS.map((f) => [f, String(body?.[f] ?? "").trim().slice(0, 500)]));
  if (!a.handle || !a.contact) return Response.json({ ok: false, invalid: true }, { status: 400 });
  if (body?.consent !== true) return Response.json({ ok: false, invalid: "consent" }, { status: 400 });

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  // Every application writes to Redis and fires owner alerts, so cap floods. Per IP is loose because of CGNAT.
  const ipHits = await store.hit(`apply:ip:${ip}`, 3600);
  const dayHits = await store.hit(`apply:day:${new Date().toISOString().slice(0, 10)}`, 86400);
  if (ipHits > APPLY_PER_IP_PER_HOUR || dayHits > APPLY_PER_DAY) return Response.json({ ok: false, limited: true }, { status: 429 });
  const c = consentRecord([APPLY_CONSENT], ip);
  await store.addApplication({ ...a, consentVersion: c.version, consentAt: c.at, consentIp: c.ip, consentText: APPLY_CONSENT });
  await notifyOwner("Monthly application", FIELDS.map((f) => `${f}: ${a[f] || "-"}`));
  return Response.json({ ok: true });
}
