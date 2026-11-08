import { after, type NextRequest } from "next/server";
import { COOKIE } from "@/lib/station";
import { checkAlerts, getSnapshot, scopeOf, viewFor } from "@/lib/station-live";

// The snapshot the /station page polls. Auth: the session cookie, or x-station-key for scripts.
// ?view=client&account=<slug> narrows to one client; ?account=<id> filters the owner view. No access is a 404.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const scope = await scopeOf({ headerKey: req.headers.get("x-station-key"), cookie: req.cookies.get(COOKIE)?.value, account: q.get("account") });
  const view = await viewFor(scope, { view: q.get("view"), account: q.get("account") });
  if (!view) return new Response("Not found", { status: 404 });
  try {
    if (view.mode === "owner") after(checkAlerts); // probes (site down) only change while someone looks or a beat lands
    return Response.json(await getSnapshot(view), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[station] state", err);
    return Response.json({ error: "store unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
