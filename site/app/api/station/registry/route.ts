import { keyScope, publicRegistry } from "@/lib/station";
import { liveRegistry } from "@/lib/station-live";

// The live registry (the file plus clients added from Station) for the laptop scheduler, so a new client's jobs start
// without a deploy. Owner key only; key hashes are stripped.
export async function GET(req: Request) {
  const { registry } = await liveRegistry();
  if (keyScope(req.headers.get("x-station-key"), null, process.env, registry)?.kind !== "owner") return new Response("Not found", { status: 404 });
  return Response.json(publicRegistry(registry), { headers: { "cache-control": "no-store" } });
}
