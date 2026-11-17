// Typing to KNOX from Telegram (owner only). Pure parts: the webhook secret and what an incoming message means.
// Telegram posts every message sent to the bot to /api/station/telegram; the route checks the secret and the chat,
// then either answers a short read-only command or queues the text as an ask, exactly like the Ask box on Needs me.

import { createHmac, timingSafeEqual } from "node:crypto";

/** The secret Telegram sends back in x-telegram-bot-api-secret-token. Derived from the owner key, so nothing new is stored. */
export function telegramSecret(stationKey: string): string {
  return createHmac("sha256", stationKey).update("knox-telegram-webhook").digest("hex");
}

/** True when the header is the secret for this key. Compared in bytes, in constant time. */
export function secretOk(header: string | null | undefined, stationKey: string | undefined): boolean {
  if (!stationKey || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(telegramSecret(stationKey));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Words answered from the board, read only. Anything else typed is an ask. */
export const TELEGRAM_COMMANDS = ["help", "start", "needs", "today", "stages", "money", "invoices", "health", "status", "report", "reports"] as const;

export type TelegramInbound =
  | { kind: "ignore" }
  | { kind: "command"; text: string }
  | { kind: "ask"; text: string };

/**
 * Pure: what a Telegram update means. Only a private text message from the owner's own chat counts; groups, bots,
 * edits, stickers and every other chat are ignored. "/needs", "needs" and "/needs@MyBot" are the same command.
 * "/ask write 3 hooks..." and plain text are asks.
 */
export function readUpdate(update: unknown, ownerChat: string | undefined): TelegramInbound {
  const m = (update as { message?: { text?: unknown; chat?: { id?: unknown; type?: unknown }; from?: { is_bot?: unknown } } } | null)?.message;
  if (!ownerChat || !m || typeof m.text !== "string") return { kind: "ignore" };
  if (m.chat?.type !== "private" || String(m.chat.id) !== ownerChat || m.from?.is_bot === true) return { kind: "ignore" };
  const text = m.text.trim();
  if (!text) return { kind: "ignore" };
  const ask = text.match(/^\/ask(?:@\w+)?\s+([\s\S]+)$/i);
  if (ask) return { kind: "ask", text: ask[1].trim() };
  const word = text.replace(/^\//, "").replace(/@\w+$/, "").trim().toLowerCase();
  if ((TELEGRAM_COMMANDS as readonly string[]).includes(word)) return { kind: "command", text: word === "start" ? "help" : word };
  return { kind: "ask", text };
}
