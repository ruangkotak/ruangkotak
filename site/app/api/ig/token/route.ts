import { keyScope } from "@/lib/station";
import { liveRegistry } from "@/lib/station-live";
import { igStore } from "@/lib/store";

// Station's laptop pushes the Instagram token here after each weekly refresh, so the follow-gate webhook never runs on
// an expired one. POST { token }, owner key (x-station-key) only; anything else is a 404. The token is never returned.
export async function POST(req: Request) {
  const { registry } = await liveRegistry();
  if (keyScope(req.headers.get("x-station-key"), null, process.env, registry)?.kind !== "owner") return new Response("Not found", { status: 404 });
  const token = ((await req.json().catch(() => null)) as { token?: unknown } | null)?.token;
  if (typeof token !== "string" || !/^[A-Za-z0-9_\-.|]{20,1000}$/.test(token)) return Response.json({ ok: false, error: "bad token" }, { status: 400 });
  try {
    await igStore.setToken(token);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[ig-gate] token", (err as Error).message);
    return Response.json({ ok: false, error: "store unavailable" }, { status: 503 });
  }
}
