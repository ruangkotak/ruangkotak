// ALANA live mic: hands the local ALANA page a single-use ElevenLabs token for realtime speech-to-text.
// The API key stays on this server (.env.local); the page only ever sees a 15-minute, single-use token.
// Local only: browsers are allowed from localhost / 127.0.0.1 / file:// (Origin "null", e.g. Obsidian), and the
// route is off in production unless ALANA_ALLOW_PROD is set. `npm run dev` binds to 127.0.0.1.
// Any web page can send Origin "null" from a sandboxed iframe, so every POST must also carry X-Alana-Mic-Key
// matching ALANA_MIC_SECRET (.env.local). The ALANA page reads it from alana-mic-key.js next to alana.html.

import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

const TOKEN_URL = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOOPBACK_IP = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+|localhost)$/i;

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (origin === "null" || origin === "file://" || origin === "app://obsidian.md") return origin;
  return LOCAL_ORIGIN.test(origin) ? origin : null;
}

function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (origin) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, X-Alana-Mic-Key";
    h["Access-Control-Allow-Private-Network"] = "true";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}

// Returns the allowed origin, or a ready 403 response.
function gate(req: Request): { origin: string } | { res: Response } {
  if (process.env.NODE_ENV === "production" && !process.env.ALANA_ALLOW_PROD) {
    return { res: Response.json({ error: "disabled" }, { status: 403, headers: { "Cache-Control": "no-store" } }) };
  }
  const origin = allowedOrigin(req.headers.get("origin"));
  // Next fills x-forwarded-for from the socket when absent, so this is best-effort; the real guard is binding the dev
  // server to 127.0.0.1 (next dev -H 127.0.0.1) so nothing else on the network can reach it.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (!origin || (ip && !LOOPBACK_IP.test(ip))) {
    return { res: Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store", Vary: "Origin" } }) };
  }
  return { origin };
}

function keyMatches(req: Request, secret: string): boolean {
  const got = Buffer.from(req.headers.get("x-alana-mic-key") ?? "");
  const want = Buffer.from(secret);
  return got.length === want.length && timingSafeEqual(got, want);
}

export function OPTIONS(req: Request) {
  const g = gate(req);
  if ("res" in g) return g.res;
  return new Response(null, { status: 204, headers: cors(g.origin) });
}

export async function POST(req: Request) {
  const g = gate(req);
  if ("res" in g) return g.res;
  const headers = cors(g.origin);
  const secret = process.env.ALANA_MIC_SECRET;
  if (!secret) return Response.json({ error: "missing_secret" }, { status: 500, headers });
  if (!keyMatches(req, secret)) return Response.json({ error: "bad_key" }, { status: 403, headers });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: "missing_key" }, { status: 500, headers });
  try {
    const r = await fetch(TOKEN_URL, { method: "POST", headers: { "xi-api-key": key }, cache: "no-store" });
    const data = (await r.json().catch(() => null)) as { token?: string } | null;
    if (!r.ok || !data?.token) return Response.json({ error: "elevenlabs", status: r.status }, { status: 502, headers });
    return Response.json({ token: data.token }, { headers });
  } catch {
    return Response.json({ error: "network" }, { status: 502, headers });
  }
}
