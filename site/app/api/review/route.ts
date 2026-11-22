import { headers } from "next/headers";
import { clientReply, clientView } from "@/lib/production";
import { notifyOwner } from "@/lib/notify";
import { prodStore, store } from "@/lib/store";

// The client's review link (/review?t=<token>): read the script and storyboard, then approve or flag a wrong fact.
// The token is the only key. Nothing of the owner's (brief, fee, other jobs) is ever returned.

const PER_IP_PER_HOUR = 60;
const noStore = { "cache-control": "no-store" };
const tokenOk = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{20,40}$/.test(t);

async function find(t: unknown) {
  if (!tokenOk(t)) return null;
  return (await prodStore.all()).find((p) => p.token === t) ?? null;
}

async function limited() {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  return (await store.hit(`review:ip:${ip}`, 3600)) > PER_IP_PER_HOUR;
}

export async function GET(req: Request) {
  try {
    if (await limited()) return Response.json({ error: "Too many requests. Try again in an hour." }, { status: 429, headers: noStore });
    const p = await find(new URL(req.url).searchParams.get("t"));
    if (!p) return Response.json({ error: "This review link is not valid." }, { status: 404, headers: noStore });
    return Response.json(clientView(p), { headers: noStore });
  } catch (err) {
    console.error("[review]", err);
    return Response.json({ error: "Unavailable. Try again shortly." }, { status: 503, headers: noStore });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { t?: unknown; decision?: unknown; note?: unknown } | null;
  try {
    if (await limited()) return Response.json({ ok: false, error: "Too many requests. Try again in an hour." }, { status: 429, headers: noStore });
    const p = await find(body?.t);
    if (!p) return Response.json({ ok: false, error: "This review link is not valid." }, { status: 404, headers: noStore });
    const r = clientReply(p, body?.decision, body?.note, new Date().toISOString());
    if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: 400, headers: noStore });
    await prodStore.save(r.value);
    const approved = r.value.stage === "approved";
    await notifyOwner(`KNOX: ${p.brand} ${approved ? "approved" : "flagged facts in"} the script for ${p.what}`, [
      approved ? "Ready to record. Open KNOX → Clients." : `Their note: ${r.value.clientNote ?? ""}`,
    ]).catch(() => {});
    return Response.json({ ok: true, view: clientView(r.value) }, { headers: noStore });
  } catch (err) {
    console.error("[review]", err);
    return Response.json({ ok: false, error: "Unavailable. Nothing was saved." }, { status: 503, headers: noStore });
  }
}
