import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { notifyTelegram } from "@/lib/notify";
import { SITE } from "@/lib/site";
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
  if (body?.action !== "test") return Response.json({ ok: false, error: "Unknown action." }, { status: 400, headers: noStore });
  if (!telegramReady()) return Response.json({ ok: false, error: "Telegram is not set up: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are missing." }, { status: 400, headers: noStore });
  const ok = await notifyTelegram(`KNOX test alert. Alerts arrive here when something new needs you, and when it clears.\n\n${SITE}/station#alerts`);
  return Response.json(ok ? { ok: true } : { ok: false, error: "Telegram refused the message. Check the bot token and chat id." }, { status: ok ? 200 : 502, headers: noStore });
}
