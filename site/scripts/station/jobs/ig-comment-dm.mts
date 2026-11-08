// Funnel Operator, every 15 minutes: who commented a trigger word and is owed a DM?
// Reads the comments on up to 3 reels from the last 7 days, finds the ones containing a keyword from
// STATION_IG_KEYWORDS (e.g. "AUDIT,KOTAK"), and appends each new one to a checklist on this laptop:
// <vault>/Station/dm-queue-<handle>.md when a vault is set, else ~/.local/state/ruangkotak-station/.
// Tick a box once the DM is sent. Station only ever gets the count of unticked boxes and the oldest one's time
// (the DM gate); commenters' names and words stay on the laptop.
// It does not send DMs: that needs a Meta app with messaging permission, which this account does not have yet.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { apify, readSnapshot, scrapeReels, writeSnapshot } from "../apify.mts";
import type { JobContext, JobResult } from "../client.mts";
import { appendToQueue, checklistLine, clean, readQueueFile, stationFolder } from "../queue.mts";

export { readQueue } from "../queue.mts";

export const requires = ["APIFY_TOKEN", "STATION_IG_KEYWORDS"];
export const unavailable = (ctx: JobContext) => (ctx.account.instagram ? null : `${ctx.account.label} has no instagram handle in the registry`);

const RECENT_DAYS = 7;
const MAX_POSTS = 3;
const COMMENTS_PER_POST = 100;
const SNAPSHOT_MAX_AGE_H = 12;
const SEEN_CAP = 5000;

export type Comment = { id: string; user: string; text: string; at: string; post: string };
type IgComment = { id?: string; text?: string; ownerUsername?: string; owner?: { username?: string }; timestamp?: string };

export const keywordsOf = (raw: string) => raw.split(",").map((k) => k.trim()).filter(Boolean);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive: "audit" matches "AUDIT please!" but not "auditorium". */
export function matches(text: string, keywords: string[]) {
  return keywords.some((k) => new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(k)}($|[^\\p{L}\\p{N}_])`, "iu").test(text));
}

export function queueLine(c: Comment) {
  return checklistLine(c.id, c.at, `@${clean(c.user)} · "${clean(c.text).slice(0, 140)}" · ${c.post}`);
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const handle = ctx.account.instagram!;
  const token = ctx.env.APIFY_TOKEN!;
  const keywords = keywordsOf(ctx.env.STATION_IG_KEYWORDS!);
  const queue = join(stationFolder(ctx.env, ctx.stateDir), `dm-queue-${handle}.md`);
  const seenFile = join(ctx.stateDir, "ig", `dm-seen-${handle}.json`);
  try {
    // Which reels to watch: from the shared snapshot when it is fresh, else one cheap scrape.
    let snap = readSnapshot(ctx.stateDir, handle);
    if (!snap || Date.now() - Date.parse(snap.at) > SNAPSHOT_MAX_AGE_H * 3600_000) {
      snap = { handle, at: new Date().toISOString(), reels: await scrapeReels(token, handle, 6) };
      if (snap.reels.length) writeSnapshot(ctx.stateDir, snap);
    }
    const posts = snap.reels.filter((r) => Date.now() - Date.parse(r.at) < RECENT_DAYS * 86400_000).slice(0, MAX_POSTS);

    const seen = new Set<string>(existsSync(seenFile) ? JSON.parse(readFileSync(seenFile, "utf8")) : []);
    const fresh: Comment[] = [];
    let read = 0;
    for (const p of posts) {
      const items = await apify<IgComment>(token, "apify~instagram-comment-scraper", { directUrls: [p.url], resultsLimit: COMMENTS_PER_POST });
      const comments = items
        .map((i) => ({ id: i.id ?? "", user: i.ownerUsername ?? i.owner?.username ?? "", text: i.text ?? "", at: i.timestamp ?? "", post: p.url }))
        .filter((c) => c.id && c.text);
      if (items.length && !comments.length) return { ok: false, message: `comment data has an unexpected shape (fields: ${Object.keys(items[0]).slice(0, 8).join(",")})` };
      read += comments.length;
      for (const c of comments) {
        if (seen.has(c.id) || c.user.toLowerCase() === handle) continue;
        seen.add(c.id);
        if (matches(c.text, keywords)) fresh.push({ ...c, at: Number.isNaN(Date.parse(c.at)) ? new Date().toISOString() : new Date(c.at).toISOString() });
      }
    }

    appendToQueue(
      queue,
      `# Comment → DM queue for @${handle}\n\nTick a box once the DM is sent. Station counts the unticked ones (gate: DM). Keywords: ${keywords.join(", ")}`,
      fresh.sort((a, b) => a.at.localeCompare(b.at)).map(queueLine),
    );
    mkdirSync(dirname(seenFile), { recursive: true });
    writeFileSync(seenFile, JSON.stringify([...seen].slice(-SEEN_CAP)));

    const q = readQueueFile(queue);
    const msg = posts.length
      ? `${posts.length} recent reel${posts.length > 1 ? "s" : ""} · ${read} comments read · ${fresh.length} new keyword comment${fresh.length === 1 ? "" : "s"} · ${q.waiting} waiting for a DM`
      : `no reels in the last ${RECENT_DAYS} days · ${q.waiting} waiting for a DM`;
    return { ok: true, message: msg, gates: [{ gate: "dm", waiting: q.waiting, oldestAt: q.oldestAt }] };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
