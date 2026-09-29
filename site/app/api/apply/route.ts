import { notifyOwner } from "@/lib/notify";
import { store } from "@/lib/store";

const FIELDS = ["name", "handle", "platform", "niche", "views", "goal", "contact"] as const;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const a = Object.fromEntries(FIELDS.map((f) => [f, String(body?.[f] ?? "").trim().slice(0, 500)]));
  if (!a.handle || !a.contact) return Response.json({ ok: false, invalid: true }, { status: 400 });

  await store.addApplication(a);
  await notifyOwner("Monthly application", FIELDS.map((f) => `${f}: ${a[f] || "-"}`));
  return Response.json({ ok: true });
}
