import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, cookieFor, keyScope } from "@/lib/station";
import { liveRegistry } from "@/lib/station-live";
import { clientStore } from "@/lib/store";

// Swaps a key in the URL for a session cookie, then sends the visitor to a clean /station URL,
// so the key does not sit in the address bar, browser history or shared screenshots.
// /station?key=… redirects here. A wrong key is a 404, the same as a route that does not exist.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const account = q.get("account");
  const { registry, clients } = await liveRegistry();
  const scope = keyScope(q.get("key"), account, process.env, registry);
  const value = scope && cookieFor(scope, process.env, registry);
  if (!scope || !value) return new Response("Not found", { status: 404 });
  // For clients added from Station, note when they first (and last) opened their link: the onboarding checklist shows it.
  const stored = scope.kind === "client" && clients.find((c) => c.id === scope.account);
  if (stored) {
    const at = new Date().toISOString();
    await clientStore.save({ ...stored, openedAt: stored.openedAt ?? at, lastSeenAt: at }).catch((err) => console.error("[station] client seen", err));
  }
  // Locally, open Station on http://localhost:3100: Next reports its origin as localhost, and the cookie belongs to the host.
  const to = new URL("/station", req.nextUrl.origin);
  if (scope.kind === "client") to.search = `${new URLSearchParams({ view: "client", account: scope.account })}`;
  // ?to=alerts (or jobs, agents, clients) opens that tab: links in Telegram and in the access file use it.
  const tab = q.get("to");
  if (tab && ["agents", "jobs", "alerts", "clients"].includes(tab)) to.hash = tab;
  const res = NextResponse.redirect(to, 303);
  // Lax, not Strict: a link opened from WhatsApp or email starts cross-site, and Strict would drop the cookie on the redirect back.
  res.cookies.set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
