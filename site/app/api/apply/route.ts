import { FUNNEL_LIVE, funnelClosed } from "@/lib/funnel";
import { notifyOwner } from "@/lib/notify";
import { headers } from "next/headers";
import { APPLY_CONSENT, consentRecord } from "@/lib/legal";
import { store } from "@/lib/store";

const FIELDS = ["name", "handle", "platform", "niche", "views", "goal", "contact"] as const;

export async function POST(req: Request) {
  if (!FUNNEL_LIVE) return funnelClosed();
  const body = await req.json().catch(() => null);
  const a = Object.fromEntries(FIELDS.map((f) => [f, String(body?.[f] ?? "").trim().slice(0, 500)]));
  if (!a.handle || !a.contact) return Response.json({ ok: false, invalid: true }, { status: 400 });
  if (body?.consent !== true) return Response.json({ ok: false, invalid: "consent" }, { status: 400 });

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const c = consentRecord([APPLY_CONSENT.en], ip);
  await store.addApplication({ ...a, consentVersion: c.version, consentAt: c.at, consentIp: c.ip, consentText: APPLY_CONSENT.en });
  await notifyOwner("Monthly application", FIELDS.map((f) => `${f}: ${a[f] || "-"}`));
  return Response.json({ ok: true });
}
