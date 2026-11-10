// CMO Reviewer, 09:00 daily: is the content board ready for the week?
// Reads content/<YYYY-MM-DD>/*.md (or STATION_CONTENT_DIR), where each post carries a line like
//   **Status:** DRAFT. Not published. Needs Alan's review.
// APPROVED, READY, SCHEDULED and PUBLISHED count as done; anything else is a draft waiting for review.
// A file with no **Status:** line is a note (research, shot list), not a post, and is not counted.
// Station's Review gate counts drafts dated today or later. A draft publishing within a day goes to Needs you.
// Only counts and dates leave the laptop, never titles or copy.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { mytDay } from "./reminder-check.mts";

const DONE = new Set(["APPROVED", "READY", "SCHEDULED", "PUBLISHED", "POSTED", "LIVE"]);
const WEEK = 7;

export type Post = { day: string; file: string; status: string; changedAt: string };

export const contentDir = (ctx: Pick<JobContext, "env" | "repo">) => ctx.env.STATION_CONTENT_DIR ?? join(ctx.repo, "content");
export const unavailable = (ctx: JobContext) => (existsSync(contentDir(ctx)) ? null : `no content folder at ${contentDir(ctx)}`);

/** The first word after **Status:**, upper-cased; "UNKNOWN" when the post has no status line. */
export function statusOf(text: string) {
  return (/\*\*Status:?\*\*:?\s*([A-Za-z-]+)/.exec(text)?.[1] ?? "unknown").toUpperCase();
}

/** Whether the file carries a **Status:** line, which is what makes it a post and not a note. */
export const hasStatus = (text: string) => /\*\*Status:?\*\*/.test(text);

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Pure: the Station result from the board on a given Malaysia-time day. */
export function review(posts: Post[], today: string): JobResult {
  const isDraft = (p: Post) => !DONE.has(p.status);
  const ahead = posts.filter((p) => p.day >= today);
  const week = ahead.filter((p) => p.day < addDays(today, WEEK));
  const drafts = ahead.filter(isDraft);
  const urgent = drafts.filter((p) => p.day <= addDays(today, 1));
  const stale = posts.filter((p) => p.day < today && isDraft(p));
  const covered = new Set(week.map((p) => p.day)).size;

  const parts = [
    `next ${WEEK} days: ${plural(week.length, "post")} on ${covered} of ${WEEK} days`,
    `${plural(drafts.length, "draft")} waiting for review`,
  ];
  if (stale.length) parts.push(`${plural(stale.length, "past draft")} never marked published`);
  const oldestAt = drafts.map((p) => p.changedAt).sort()[0];
  return {
    ok: true,
    message: parts.join(" · "),
    attention: urgent.length ? `${plural(urgent.length, "draft")} publishing within a day ${urgent.length === 1 ? "is" : "are"} not approved` : undefined,
    gates: [{ gate: "review", waiting: drafts.length, oldestAt }],
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
      posts.push({ day, file: `${day}/${f}`, status: statusOf(text), changedAt: statSync(path).mtime.toISOString() });
    }
  }
  return posts.sort((a, b) => a.day.localeCompare(b.day));
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  try {
    return review(readBoard(contentDir(ctx)), mytDay(ctx.now));
  } catch (err) {
    return { ok: false, message: `cannot read the content board: ${(err as Error).message}` };
  }
}
