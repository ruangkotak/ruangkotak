// CMO Reviewer, every hour: is the content board ready for the week, and how many posts went out this week?
// Reads content/<YYYY-MM-DD>/*.md (or STATION_CONTENT_DIR), where each post carries a line like
//   **Status:** DRAFT. Not published. Needs Alan's review.
// APPROVED, READY, SCHEDULED and PUBLISHED count as done; anything else is a draft waiting for review.
// A file with no **Status:** line is a note (research, shot list), not a post, and is not counted.
// Station's Review gate counts drafts dated today or later. A draft publishing within a day goes to Needs you.
// The Post gate counts posts that are approved but not yet marked PUBLISHED (or POSTED, LIVE).
// PLANNED (or IDEA) is a slot with a format and no script yet: it fills a day but is not waiting for review.
// The posting week (Monday to Sunday, Malaysia time) counts posts marked live against STATION_POST_TARGET (default 7)
// and rides on the Post gate. See posting-week.mts for the Monday plan and review.
// Only counts and dates leave the laptop, never titles or copy.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { addDays, plural } from "../queue.mts";
import { mytDay } from "./reminder-check.mts";
import { weekStart, type PostingWeek } from "../../../lib/station.ts";

export const DONE = new Set(["APPROVED", "READY", "SCHEDULED", "PUBLISHED", "POSTED", "LIVE"]);
/** Out in the world. Anything done but not live is approved and still waiting to be posted. */
export const LIVE = new Set(["PUBLISHED", "POSTED", "LIVE"]);
/**
 * Closed without going out: turned down in Station (or by hand), or TESTED, a piece made to try the pipeline and never
 * meant to be posted. Never waiting for review, never waiting to be posted.
 */
export const REJECTED = new Set(["REJECTED", "DROPPED", "TESTED"]);
/** A slot on the plan: a day and a format, no script yet. Not a draft for review. */
export const PLANNED = new Set(["PLANNED", "IDEA"]);
/** Written, not approved, not closed: what the owner is asked to review. */
export const awaitingReview = (status: string) => !DONE.has(status) && !REJECTED.has(status) && !PLANNED.has(status);
/** Posts a week the owner is aiming for: STATION_POST_TARGET on the laptop, else 7. */
export const postTarget = (env: Record<string, string | undefined>) => {
  const n = Number(env.STATION_POST_TARGET);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 7;
};
const WEEK = 7;

export type Post = { day: string; file: string; status: string; changedAt: string; format?: string };

export const contentDir = (ctx: Pick<JobContext, "env" | "repo">) => ctx.env.STATION_CONTENT_DIR ?? join(ctx.repo, "content");
export const unavailable = (ctx: JobContext) => (existsSync(contentDir(ctx)) ? null : `no content folder at ${contentDir(ctx)}`);

/** The first word after **Status:**, upper-cased; "UNKNOWN" when the post has no status line. */
export function statusOf(text: string) {
  return (/\*\*Status:?\*\*:?\s*([A-Za-z-]+)/.exec(text)?.[1] ?? "unknown").toUpperCase();
}

/** Whether the file carries a **Status:** line, which is what makes it a post and not a note. */
export const hasStatus = (text: string) => /\*\*Status:?\*\*/.test(text);

/** Pure: the text with its first **Status:** line replaced by `**Status:** <status>`; null when there is no such line. */
export function setStatus(text: string, status: string): string | null {
  const line = /^\*\*Status:?\*\*:?.*$/m;
  return line.test(text) ? text.replace(line, `**Status:** ${status}`) : null;
}

/** The format named after **Format:** (up to the next · or line end); undefined when there is none. */
export const formatOf = (text: string) => /\*\*Format:?\*\*:?[ \t]*([^·\n]+)/.exec(text)?.[1].trim() || undefined;

/** Pure: the posting week that contains `today`, and how many weeks in a row reached the target before it. */
export function postingWeek(posts: Post[], today: string, target: number): PostingWeek {
  const start = weekStart(today);
  const liveIn = (from: string) => posts.filter((p) => LIVE.has(p.status) && p.day >= from && p.day < addDays(from, WEEK)).length;
  const posted = liveIn(start);
  const planned = posts.filter((p) => PLANNED.has(p.status) && p.day >= start && p.day < addDays(start, WEEK)).length;
  let streak = 0;
  for (let w = addDays(start, -WEEK); streak < 520 && liveIn(w) >= target; w = addDays(w, -WEEK)) streak++;
  return { start, posted, target, planned, streak: streak + (posted >= target ? 1 : 0) };
}

/** Pure: a warning when the week is behind pace: fewer posts live than the days already gone would need. */
export function behindPace(week: PostingWeek, today: string) {
  const gone = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${week.start}T00:00:00Z`)) / 86400_000;
  const expected = Math.floor((week.target * gone) / WEEK);
  return week.posted < expected ? `posting behind: ${week.posted} of ${week.target} live this week, ${expected} expected by now` : undefined;
}

/** The first heading, without the `#`; the file name when there is none. */
export const titleOf = (text: string, fallback: string) => /^#\s+(.+)$/m.exec(text)?.[1].trim() ?? fallback;


/** Pure: the Station result from the board on a given Malaysia-time day. With a target, the posting week rides on the Post gate. */
export function review(all: Post[], today: string, target?: number): JobResult {
  const posts = all.filter((p) => !REJECTED.has(p.status));
  const isDraft = (p: Post) => awaitingReview(p.status);
  const ahead = posts.filter((p) => p.day >= today);
  const week = ahead.filter((p) => p.day < addDays(today, WEEK));
  const drafts = ahead.filter(isDraft);
  const urgent = drafts.filter((p) => p.day <= addDays(today, 1));
  const stale = posts.filter((p) => p.day < today && isDraft(p));
  const unscripted = posts.filter((p) => PLANNED.has(p.status) && p.day >= today && p.day <= addDays(today, 1));
  const postWeek = target ? postingWeek(posts, today, target) : undefined;
  const covered = new Set(week.map((p) => p.day)).size;
  const toPost = posts.filter((p) => DONE.has(p.status) && !LIVE.has(p.status));
  const missed = toPost.filter((p) => p.day < today);

  const parts = [
    `next ${WEEK} days: ${plural(week.length, "post")} on ${covered} of ${WEEK} days`,
    `${plural(drafts.length, "draft")} waiting for review`,
  ];
  if (stale.length) parts.push(`${plural(stale.length, "past draft")} never marked published`);
  if (toPost.length) parts.push(`${toPost.length} approved, not posted yet`);
  if (postWeek) parts.unshift(`this week: ${postWeek.posted} of ${postWeek.target} live${postWeek.planned ? `, ${postWeek.planned} only planned` : ""}${postWeek.streak ? ` · ${postWeek.streak}-week streak` : ""}`);
  const oldestAt = drafts.map((p) => p.changedAt).sort()[0];
  const attention = [
    urgent.length && `${plural(urgent.length, "draft")} publishing within a day ${urgent.length === 1 ? "is" : "are"} not approved`,
    missed.length && `${plural(missed.length, "approved post")} past ${missed.length === 1 ? "its" : "their"} posting date`,
    unscripted.length && `${plural(unscripted.length, "planned slot")} within a day ${unscripted.length === 1 ? "has" : "have"} no script yet`,
    postWeek && behindPace(postWeek, today),
  ].filter(Boolean).join("; ");
  return {
    ok: true,
    message: parts.join(" · "),
    attention: attention || undefined,
    // Post: approved (or ready, scheduled) and not yet marked PUBLISHED. Set the status once it is live to clear it.
    gates: [{ gate: "review", waiting: drafts.length, oldestAt }, { gate: "post", waiting: toPost.length, oldestAt: toPost.map((p) => p.changedAt).sort()[0], ...(postWeek ? { week: postWeek } : {}) }],
  };
}

export function readBoard(dir: string): Post[] {
  const posts: Post[] = [];
  for (const day of readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !statSync(join(dir, day)).isDirectory()) continue;
    for (const f of readdirSync(join(dir, day))) {
      if (!f.endsWith(".md")) continue;
      const path = join(dir, day, f);
      const text = readFileSync(path, "utf8");
      if (!hasStatus(text)) continue; // a note beside the post (research, a shot list), not a post
      const format = formatOf(text);
      posts.push({ day, file: `${day}/${f}`, status: statusOf(text), changedAt: statSync(path).mtime.toISOString(), ...(format ? { format } : {}) });
    }
  }
  return posts.sort((a, b) => a.day.localeCompare(b.day));
}

/** Whose a post is: the first word after **Client:** in its header ("" when it has none). */
export const clientOf = (text: string) => /\*\*Client:?\*\*:?\s*([^\s·(]+)/.exec(text)?.[1] ?? "";

/** The posts with their text, for the owner's Preview on the board (only drafts are sent, see draft-review). */
export function readDrafts(dir: string): (Post & { title: string; client: string; text: string })[] {
  return readBoard(dir).map((p) => {
    const text = readFileSync(join(dir, p.file), "utf8");
    return { ...p, title: titleOf(text, p.file), client: clientOf(text), text };
  });
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  try {
    return review(readBoard(contentDir(ctx)), mytDay(ctx.now), postTarget(ctx.env));
  } catch (err) {
    return { ok: false, message: `cannot read the content board: ${(err as Error).message}` };
  }
}
