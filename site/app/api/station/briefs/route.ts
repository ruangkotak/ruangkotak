import { keyScope } from "@/lib/station";
import { registry } from "@/lib/station-live";
import { applicationsSince } from "@/lib/store";

// The brief sweep on the owner's laptop reads new monthly applications here: GET ?since=<ISO>, header x-station-key.
// Owner key only (client keys and everyone else get a 404). Returns what is needed to review a brief and reply with a
// quote: no name, no contact details, no consent record. Those stay in Redis and the owner alert.
export async function GET(req: Request) {
  if (keyScope(req.headers.get("x-station-key"), null, process.env, registry)?.kind !== "owner") return new Response("Not found", { status: 404 });
  const raw = new URL(req.url).searchParams.get("since");
  const since = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : new Date(Date.now() - 30 * 86400_000).toISOString();
  try {
    return Response.json({ since, applications: await applicationsSince(since) }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[station] briefs", err);
    return Response.json({ error: "store unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
