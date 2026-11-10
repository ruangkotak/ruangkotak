// The Instagram follow gate, server side. Station's laptop job answers a keyword comment with one private reply that
// carries a button; the button's payload holds the link message and the "follow first" message. When someone taps it,
// Meta posts the tap to app/api/ig/webhook, which checks whether they follow the account and sends one or the other.
// Pure helpers here (no I/O besides the Graph calls given a token), so the tests can import them.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Matches PAYLOAD_PREFIX in scripts/station/instagram.mts. */
export const PAYLOAD_PREFIX = "rk1:";

export type GatePayload = { link: string; nudge: string; button: string };
export type Tap = { account: string; sender: string; mid: string; payload: GatePayload };

/** The button's payload back into its messages, or null for a button that isn't ours (or a malformed one). */
export function decodePayload(raw: unknown): GatePayload | null {
  if (typeof raw !== "string" || !raw.startsWith(PAYLOAD_PREFIX)) return null;
  try {
    const p = JSON.parse(raw.slice(PAYLOAD_PREFIX.length)) as { l?: unknown; n?: unknown; b?: unknown };
    if (typeof p.l !== "string" || !p.l.trim() || typeof p.n !== "string" || !p.n.trim() || typeof p.b !== "string" || !p.b.trim()) return null;
    return { link: p.l, nudge: p.n, button: p.b };
  } catch {
    return null;
  }
}

/** Meta signs every webhook POST: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, the Instagram app secret). */
export function validSignature(body: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return got.length === want.length && timingSafeEqual(got, want);
}

type Messaging = { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; postback?: { mid?: string; payload?: unknown }; message?: { is_echo?: boolean } };

/** Our button taps in a webhook body. Echoes, other buttons, plain messages and taps by the account itself are skipped. */
export function tapsIn(body: unknown): Tap[] {
  const entries = (body as { object?: string; entry?: { id?: string; messaging?: Messaging[] }[] })?.entry;
  if (!Array.isArray(entries)) return [];
  const out: Tap[] = [];
  for (const e of entries) {
    for (const m of e.messaging ?? []) {
      const account = m.recipient?.id ?? e.id;
      const sender = m.sender?.id;
      const payload = decodePayload(m.postback?.payload);
      if (!payload || !account || !sender || sender === account || m.message?.is_echo) continue;
      out.push({ account, sender, mid: m.postback?.mid ?? `${sender}:${m.timestamp ?? ""}`, payload });
    }
  }
  return out;
}

export const fillName = (text: string, username: string | undefined) => text.replaceAll("{username}", username ? `@${username}` : "there");

/** The message to send for a tap: the link when they follow, otherwise the nudge with the button again. */
export function replyFor(tap: Tap, profile: { username?: string; is_user_follow_business?: boolean }) {
  if (profile.is_user_follow_business === true) return { follows: true, message: { text: fillName(tap.payload.link, profile.username) } };
  return {
    follows: false,
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: fillName(tap.payload.nudge, profile.username),
          buttons: [{ type: "postback", title: tap.payload.button, payload: `${PAYLOAD_PREFIX}${JSON.stringify({ l: tap.payload.link, n: tap.payload.nudge, b: tap.payload.button })}` }],
        },
      },
    },
  };
}

// ---------- Graph calls ----------

type Env = Record<string, string | undefined>;
/** Facebook-login tokens (EAA…) go to graph.facebook.com, Instagram-login tokens (IGAA…) to graph.instagram.com. */
export const hostFor = (token: string, version?: string) =>
  token.startsWith("EAA") ? `https://graph.facebook.com/${version ?? "v23.0"}` : `https://graph.instagram.com${version ? `/${version}` : ""}`;

async function graph<T>(env: Env, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${hostFor(token, env.IG_API_VERSION)}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok || data.error) throw new Error(`Instagram API: ${(data.error?.message ?? `HTTP ${res.status}`).replaceAll(token, "<token>").slice(0, 160)}`);
  return data;
}

/** Only readable once the person has messaged the account or tapped one of its buttons, which a tap is. */
export const profileOf = (env: Env, token: string, igsid: string) =>
  graph<{ username?: string; is_user_follow_business?: boolean }>(env, token, `/${encodeURIComponent(igsid)}?fields=username,is_user_follow_business`);

export const sendTo = (env: Env, token: string, account: string, igsid: string, message: object) =>
  graph(env, token, `/${encodeURIComponent(account)}/messages`, { method: "POST", body: JSON.stringify({ recipient: { id: igsid }, message }) });
