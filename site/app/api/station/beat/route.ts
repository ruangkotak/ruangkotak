import { keyScope, parseBeat } from "@/lib/station";
import { liveRegistry, recordBeat } from "@/lib/station-live";

// Jobs report here: POST { jobId, state: "start" | "ok" | "fail", exitCode?, message?, source? }
// or a gate reading: POST { gate, waiting, oldestAt?, account?, source? }.
// Header x-station-key must be STATION_KEY; client keys can read their own view but never write. Anything else is a 404.
export async function POST(req: Request) {
  const { registry } = await liveRegistry();
  if (keyScope(req.headers.get("x-station-key"), null, process.env, registry)?.kind !== "owner") return new Response("Not found", { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = parseBeat(body, registry);
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  try {
    await recordBeat(parsed.beat, registry);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[station] beat", err);
    return Response.json({ ok: false, error: "store unavailable" }, { status: 503 });
  }
}
