// Dispatcher, 07:00 Monday to Saturday: which monthly applications from ruangkotak.com still need a reply?
// Pulls new applications from Station (/api/station/briefs, owner key) and appends each to a checklist:
// <vault>/Station/brief-queue.md, or the state folder without a vault. Tick a box once you've replied with a quote.
// Station's Brief gate counts the unticked boxes; anything waiting over 24 hours goes to Needs you.
// Only handle, platform, niche, views and goal come down. Names and contact details stay in Redis and the owner alert
// you already get, which is where you reply from.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { appendToQueue, checklistLine, clean, readQueueFile, stationFolder } from "../queue.mts";

const FIRST_LOOKBACK_DAYS = 30;
const SEEN_CAP = 2000;

export type Brief = { id: string; at: string; handle: string; platform: string; niche: string; views: string; goal: string };

export function briefLine(b: Brief) {
  const handle = clean(b.handle).replace(/^@/, "");
  const bits = [`@${handle}`, clean(b.platform), clean(b.niche), b.views && `${clean(b.views)} views`, b.goal && `goal: "${clean(b.goal).slice(0, 140)}"`].filter(Boolean);
  return checklistLine(b.id, b.at, bits.join(" · "));
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const folder = stationFolder(ctx.env, ctx.stateDir);
  const queue = join(folder, "brief-queue.md");
  const stateFile = join(ctx.stateDir, "briefs.json");
  try {
    const state: { since?: string; seen?: string[] } = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
    const since = state.since ?? new Date(ctx.now.getTime() - FIRST_LOOKBACK_DAYS * 86400_000).toISOString();
    const res = await fetch(new URL(`/api/station/briefs?since=${encodeURIComponent(since)}`, ctx.env.STATION_URL), {
      headers: { "x-station-key": ctx.env.STATION_KEY ?? "" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, message: `briefs endpoint answered ${res.status}` };
    const { applications } = (await res.json()) as { applications: Brief[] };
    const seen = new Set(state.seen ?? []);
    const fresh = applications.filter((b) => !seen.has(b.id));
    appendToQueue(queue, "# Brief queue: monthly applications to reply to\n\nTick a box once you've replied with a quote. Station counts the unticked ones (gate: Brief). Contact details are in the owner alert for each application.", fresh.map(briefLine));
    for (const b of fresh) seen.add(b.id);
    const newest = applications.map((b) => b.at).sort().at(-1);
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ since: newest && newest > since ? newest : since, seen: [...seen].slice(-SEEN_CAP) }));
    const q = readQueueFile(queue);
    return {
      ok: true,
      message: `${fresh.length} new application${fresh.length === 1 ? "" : "s"} · ${q.waiting} waiting for a reply`,
      gates: [{ gate: "brief", waiting: q.waiting, oldestAt: q.oldestAt }],
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
