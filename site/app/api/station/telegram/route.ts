import type { NextRequest } from "next/server";
import { notifyTelegram } from "@/lib/notify";
import { answerCommand } from "@/lib/station";
import { addAsk, getSnapshot, json, liveRegistry, viewFor } from "@/lib/station-live";
import { readUpdate, secretOk } from "@/lib/telegram";

// Typing to KNOX from Telegram. Telegram posts every message sent to the bot here (registered from the Health tab:
// "Connect typing"). Not the owner's cookie: Telegram proves itself with the secret it was given, which is derived from
// the owner key. Anything else, and any chat that is not the owner's own, is ignored.
//   a word like "needs" or "money"  -> a read-only answer from the board, sent back to the same chat
//   anything else, or "/ask ..."    -> queued as an ask, exactly like the Ask box on Needs me
// KNOX still sends nothing to anyone else and never runs an agent: the laptop's route-asks job collects the ask.
export async function POST(req: NextRequest) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, STATION_KEY } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !secretOk(req.headers.get("x-telegram-bot-api-secret-token"), STATION_KEY)) {
    return new Response("Not found", { status: 404 });
  }
  const msg = readUpdate(await req.json().catch(() => null), TELEGRAM_CHAT_ID);
  if (msg.kind === "ignore") return json({ ok: true });
  // Always answer 200 after this point: a 4xx or 5xx makes Telegram send the same message again and again.
  try {
    if (msg.kind === "command") {
      const live = await liveRegistry();
      const view = await viewFor({ kind: "owner" }, {}, live);
      const snap = await getSnapshot(view!, new Date(), live);
      await notifyTelegram(answerCommand(msg.text, snap).reply);
    } else {
      const added = await addAsk({ text: msg.text });
      await notifyTelegram(added.ok
        ? "Got it. Your laptop collects it within 15 minutes, then the draft appears in KNOX under Needs me for you to approve. Nothing is sent to anyone."
        : added.error);
    }
  } catch (err) {
    console.error("[telegram] inbound", err);
    await notifyTelegram("KNOX could not read the board just now. Try again in a minute.");
  }
  return json({ ok: true });
}
