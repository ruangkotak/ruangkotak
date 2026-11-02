// Vercel Hobby can run a cron only once a day, so this route is also woken by Upstash QStash when a retry is due.
// Both callers send Authorization: Bearer CRON_SECRET. One saved lead is processed per call.
import { retryAuthorized, runDueRetries } from "../../../lib/retries.ts";

export const maxDuration = 180;

async function handle(req: Request) {
  if (!retryAuthorized(req.headers.get("authorization"))) return Response.json({ ok: false }, { status: 401 });
  await runDueRetries(Date.now());
  return Response.json({ ok: true });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
