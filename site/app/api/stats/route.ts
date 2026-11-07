import { timingSafeEqual } from "node:crypto";
import { reportList } from "@/lib/report-list";
import { dailyCounts } from "@/lib/track";

// Daily funnel totals for Alan's private outcomes dashboard: aggregate numbers only, no personal data.
// Needs ?key=<FUNNEL_STATS_KEY>; without that env var the route doesn't exist. ?days=1..90, default 56.
// ?reports=1 returns one summary line per saved diagnosis instead (no contact details).
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: Request) {
  const secret = process.env.FUNNEL_STATS_KEY;
  const url = new URL(req.url);
  if (!secret || !same(url.searchParams.get("key") ?? "", secret)) return new Response("Not found", { status: 404 });
  const days = Math.min(90, Math.max(1, Math.floor(Number(url.searchParams.get("days") ?? 56)) || 56));
  try {
    const body = url.searchParams.get("reports") === "1" ? { reports: await reportList() } : { days: await dailyCounts(days) };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[stats]", err);
    return Response.json({ error: "counters unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
