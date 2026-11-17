import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { notifyTelegram } from "@/lib/notify";
import { SITE } from "@/lib/site";
import { telegramSecret } from "@/lib/telegram";
import { checkAlerts, noStore, ownerRequest, refreshReels, telegramReady } from "@/lib/station-live";

export const maxDuration = 180;

// GET: the daily Vercel cron (Authorization: Bearer <CRON_SECRET>), the safety net for when the laptop is off and nobody
// has Station open: refreshes due reel checks, then alerts. Without CRON_SECRET it does nothing. POST (owner only): {"action":"test"} sends a test message.
// Byte lengths, not character lengths: timingSafeEqual throws when the buffers differ in size.
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !same(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Not found", { status: 404 });
  const reels = await refreshReels(); // the daily safety net also keeps reels fresh when nobody opens Station
  return Response.json({ ...(await checkAlerts()), reels }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!(await ownerRequest(req, true))) return new Response("Not found", { status: 404 });
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  if (action !== "test" && action !== "status" && action !== "connect") return Response.json({ ok: false, error: "Unknown action." }, { status: 400, headers: noStore });
  if (!telegramReady()) return Response.json({ ok: false, error: "Telegram is not set up: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are missing." }, { status: 400, headers: noStore });
  // Typing to KNOX from Telegram: whether Telegram is sending messages to /api/station/telegram, and the button that makes it so.
  if (action === "status" || action === "connect") {
    const key = process.env.STATION_KEY;
    if (!key) return Response.json({ ok: false, error: "STATION_KEY is missing, so the link cannot be signed." }, { status: 400, headers: noStore });
    const call = async (method: string, payload: object = {}) => {
      const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      return (await res?.json().catch(() => null)) as { ok?: boolean; description?: string; result?: { url?: string; last_error_message?: string } } | null;
    };
    const url = `${SITE}/api/station/telegram`;
    if (action === "connect") {
      const set = await call("setWebhook", { url, secret_token: telegramSecret(key), allowed_updates: ["message"], max_connections: 2 });
      if (!set?.ok) return Response.json({ ok: false, error: set?.description ?? "Could not reach Telegram." }, { status: 502, headers: noStore });
    }
    const info = await call("getWebhookInfo");
    return Response.json({ ok: !!info?.ok, connected: info?.result?.url === url, problem: info?.result?.last_error_message }, { headers: noStore });
  }
  const ok = await notifyTelegram(`KNOX test alert. Alerts arrive here when something new needs you, and when it clears.\n\n${SITE}/station#health`);
  return Response.json(ok ? { ok: true } : { ok: false, error: "Telegram refused the message. Check the bot token and chat id." }, { status: ok ? 200 : 502, headers: noStore });
}
