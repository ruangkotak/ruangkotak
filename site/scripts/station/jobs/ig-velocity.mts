// Performance Analyst, every 6 hours (ig-velocity-6h for @alanazizreview; client-demo-velocity and future client jobs
// share this script): how fast are the latest reels gaining plays?
// Skips when Station (the site) checked the account's reels in the last 5 hours. Otherwise scrapes the newest 12 reels, compares plays with the previous snapshot, and reports plays per hour. The first run
// only saves a baseline. Fails when the scrape fails or returns no reels (private, renamed, or blocked).
import { compact, readSnapshot, scrapeReels, writeSnapshot, type ReelSnapshot } from "../apify.mts";
import type { JobContext, JobResult } from "../client.mts";

export const requires = ["APIFY_TOKEN"];
export const unavailable = (ctx: JobContext) => (ctx.account.instagram ? null : `${ctx.account.label} has no instagram handle in the registry`);

const REELS = 12;
const H = 3600_000;

const age = (ms: number) => (ms < 48 * H ? `${Math.max(1, Math.round(ms / H))}h` : `${Math.round(ms / (24 * H))}d`);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** Pure: the report line from the previous snapshot (if any) and the new one. */
export function velocity(prev: ReelSnapshot | null, cur: ReelSnapshot): JobResult {
  const now = Date.parse(cur.at);
  const [newest, ...rest] = cur.reels;
  if (!newest) return { ok: false, message: `no public reels returned for @${cur.handle}` };
  const hours = prev ? (now - Date.parse(prev.at)) / H : 0;
  const before = new Map((prev?.reels ?? []).map((r) => [r.url, r.views]));
  const rate = (url: string, views: number) => (hours > 0.5 && before.has(url) ? Math.max(0, (views - before.get(url)!) / hours) : null);

  const parts = [`newest ${age(now - Date.parse(newest.at))} old: ${compact(newest.views)} plays`];
  const r0 = rate(newest.url, newest.views);
  if (r0 !== null) parts[0] += ` (+${compact(r0)}/h)`;
  const mid = median(rest.map((r) => r.views));
  if (rest.length >= 3 && now - Date.parse(newest.at) >= 48 * H && mid > 0) parts.push(`${(newest.views / mid).toFixed(1)}× median`);
  const fastest = cur.reels
    .slice(1)
    .map((r) => ({ r, v: rate(r.url, r.views) }))
    .filter((x): x is { r: (typeof cur.reels)[number]; v: number } => x.v !== null && x.v > 0)
    .sort((a, b) => b.v - a.v)[0];
  if (fastest && (r0 === null || fastest.v > r0)) parts.push(`fastest: ${age(now - Date.parse(fastest.r.at))}-old reel +${compact(fastest.v)}/h`);
  if (!prev) parts.push("baseline saved, rates from next run");
  return { ok: true, message: `@${cur.handle} · ${cur.reels.length} reels · ${parts.join(" · ")}` };
}

/** When Station itself checked this account's reels recently (the site does every 6 hours), the laptop skips its scrape. */
async function checkedByStation(ctx: JobContext): Promise<number | null> {
  try {
    const res = await fetch(new URL(`/api/station/state?account=${encodeURIComponent(ctx.job.account)}`, ctx.env.STATION_URL), {
      headers: { "x-station-key": ctx.env.STATION_KEY ?? "" }, signal: AbortSignal.timeout(10_000),
    });
    const at = res.ok ? ((await res.json()) as { account?: { checkedAt?: string | null } }).account?.checkedAt : null;
    return at ? Date.now() - Date.parse(at) : null;
  } catch {
    return null;
  }
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const handle = ctx.account.instagram!;
  const age = await checkedByStation(ctx);
  if (age !== null && age < 5 * H) return { ok: true, message: `@${handle} · reels checked by Station ${Math.max(1, Math.round(age / 60_000))} min ago; skipped to save Apify` };
  try {
    const prev = readSnapshot(ctx.stateDir, handle);
    const cur: ReelSnapshot = { handle, at: new Date().toISOString(), reels: await scrapeReels(ctx.env.APIFY_TOKEN!, handle, REELS) };
    const result = velocity(prev, cur);
    if (cur.reels.length) writeSnapshot(ctx.stateDir, cur);
    // Public reel stats go to Station for the account's own page (links, dates, plays; no captions).
    return { ...result, reels: cur.reels.filter((r) => /^https:\/\/(www\.)?instagram\.com\//.test(r.url)) };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
