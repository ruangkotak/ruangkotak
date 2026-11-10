import { igStore } from "@/lib/store";
import { profileOf, replyFor, sendTo, tapsIn, validSignature } from "@/lib/ig-gate";

// Instagram webhook for the follow gate (see lib/ig-gate.ts).
// GET: Meta's subscription check. Answers hub.challenge when hub.verify_token is IG_WEBHOOK_VERIFY_TOKEN.
// POST: signed with IG_APP_SECRET (the Instagram app secret). Each tap on our button gets one reply: the link if the
// person follows the account, else the "follow first" message with the button again. Token: the one Station's laptop
// pushed (kept fresh), else IG_ACCESS_TOKEN. Nothing about the person is stored or logged.

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const want = process.env.IG_WEBHOOK_VERIFY_TOKEN;
  if (want && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === want) return new Response(q.get("hub.challenge") ?? "", { headers: { "content-type": "text/plain" } });
  return new Response("Not found", { status: 404 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"), process.env.IG_APP_SECRET)) return new Response("Not found", { status: 404 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: true });
  }
  const taps = tapsIn(body);
  if (!taps.length) return Response.json({ ok: true });
  const token = (await igStore.token().catch(() => null)) ?? process.env.IG_ACCESS_TOKEN;
  if (!token) {
    console.error("[ig-gate] a button tap arrived but no Instagram token is set");
    return Response.json({ ok: true });
  }
  for (const tap of taps) {
    // Meta retries a webhook it thinks failed; one reply per tap no matter how often it arrives.
    if (!(await igStore.once(`tap:${tap.mid}`, 86400))) continue;
    try {
      const reply = replyFor(tap, await profileOf(process.env, token, tap.sender));
      await sendTo(process.env, token, tap.account, tap.sender, reply.message);
      console.log(`[ig-gate] tap answered: ${reply.follows ? "link sent" : "asked to follow"}`);
    } catch (err) {
      console.error(`[ig-gate] ${(err as Error).message}`);
    }
  }
  // Always 200 once the signature is good, so Meta doesn't disable the subscription over one failed send.
  return Response.json({ ok: true });
}
