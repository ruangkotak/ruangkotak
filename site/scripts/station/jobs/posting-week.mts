// Strategist, Monday 09:30: the posting week. Three things, all on the laptop:
//   1. Reviews the week before: posts live against the target, which formats went out, the best reel by plays.
//   2. Ranks formats by the median plays of their posts (Instagram reels matched by the post's **Instagram:** link
//      against the last reel scrape), and writes both into <notes>/Station/Posting.md.
//   3. Plans the coming week: every empty day from today to Sunday gets a PLANNED slot in content/<day>/post.md
//      with a format, best formats first. Saturday and Sunday plan the week that starts next Monday.
// Formats come from <notes>/Station/Formats.md (one "- name" per line), created with a starter list on first run.
// Only counts leave the laptop. The job never posts anything: Alan writes, films, edits and posts every one.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readSnapshot } from "../apify.mts";
import type { JobContext, JobResult } from "../client.mts";
import { addDays, plural, stationFolder } from "../queue.mts";
import { contentDir, LIVE, postTarget, readBoard, REJECTED, type Post } from "./board-completeness.mts";
import { mytDay } from "./reminder-check.mts";
import { weekStart } from "../../../lib/station.ts";

export const FORMATS_TEMPLATE = `# Formats

The formats the Monday plan rotates through, one per line starting with "- ". Best performers get more slots once
their posts have plays. Rename, add or delete lines freely; a post's **Format:** line must match a name here.

- Unbox and first test
- Sound test
- Versus
- 3 things I'd change
- Setup tour
- Worth it? Verdict
- Quick tip
`;

export const POSTING_HEADER = `# Posting

Goal: 7 posts a week on Instagram & TikTok, 4 weeks in a row (Mon 23 Nov to Sun 20 Dec 2026).
One row a week, added every Monday by posting-week. "Live" counts posts marked PUBLISHED, POSTED or LIVE.

| Week of | Live | Target | Hit | Formats live | Best reel (plays) |
| --- | --- | --- | --- | --- | --- |
`;

export type Linked = Post & { instagram?: string };
export type FormatStat = { format: string; live: number; withPlays: number; median: number | null };

/** The names in Formats.md, in order, without duplicates. */
export function parseFormats(text: string): string[] {
  const names = text.split("\n").map((l) => /^\s*[-*]\s+(?!\[)(.+?)\s*$/.exec(l)?.[1]).filter((x): x is string => !!x);
  return [...new Set(names)];
}

/** The reel's short code from an instagram.com/reel/<code> or /p/<code> link. */
export const reelCode = (url: string) => /instagram\.com\/(?:[\w.]+\/)?(?:reels?|p)\/([\w-]+)/.exec(url)?.[1];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

/** Pure: per format, how many posts went live and the median plays of those with a matched reel. Known formats first. */
export function formatStats(posts: Linked[], plays: Map<string, number>, formats: string[]): FormatStat[] {
  const names = [...new Set([...formats, ...posts.map((p) => p.format).filter((x): x is string => !!x)])];
  return names.map((format) => {
    const live = posts.filter((p) => p.format === format && LIVE.has(p.status));
    const counted = live.map((p) => (p.instagram ? plays.get(reelCode(p.instagram) ?? "") : undefined)).filter((x): x is number => x !== undefined);
    return { format, live: live.length, withPlays: counted.length, median: median(counted) };
  });
}

/**
 * Pure: the formats for `n` slots. Formats with plays from at least 2 posts are ranked by median plays and the top two
 * get a second slot; formats without enough data follow in list order so they still get tried.
 */
export function pickFormats(formats: string[], stats: FormatStat[], n: number): string[] {
  if (!formats.length) return Array(n).fill("Open format");
  const byName = new Map(stats.map((s) => [s.format, s]));
  const known = formats.filter((f) => (byName.get(f)?.withPlays ?? 0) >= 2).sort((a, b) => byName.get(b)!.median! - byName.get(a)!.median!);
  const untried = formats.filter((f) => !known.includes(f));
  const order = known.length >= 3 ? [known[0], known[1], ...known.slice(0, 2), ...untried, ...known.slice(2)] : [...known, ...untried];
  // Spread repeats so the same format is not on two days in a row when there is a choice.
  const out: string[] = [];
  const pool = [...order];
  while (out.length < n) {
    if (!pool.length) pool.push(...order);
    const i = pool.findIndex((f) => f !== out.at(-1));
    out.push(...pool.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

const DAY_NAME = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayName = (day: string) => DAY_NAME.format(new Date(`${day}T00:00:00Z`)).replace(",", "");

/** The text of a planned slot. Only placeholders: what is reviewed and said is Alan's. */
export function slotText(day: string, format: string) {
  return `# ${dayName(day)} - ${format}

**Format:** ${format} · **Platforms:** Instagram & TikTok
**Status:** PLANNED

Product: [which gear]
Brand: [who sent it, and whether this is the video to ask them the RM500 fee for]

Steps:
1. Write the script here (or ask KNOX for one), then change the Status line to \`**Status:** DRAFT\` to review it on KNOX.
2. Approved: film it in the studio and edit it. The verdict is yours, from your own testing.
3. Posted on Instagram & TikTok: paste both links below and change the Status line to \`**Status:** PUBLISHED\`.

**Instagram:**
**TikTok:**
`;
}

/** The week the plan is for: this one from Monday to Friday, next week on Saturday and Sunday. */
export const planWeek = (today: string) => weekStart(addDays(today, 2));

/** Pure: the slots to create, as day + format, for the days from today to the plan week's Sunday that have no post. */
export function planSlots(posts: Post[], today: string, target: number, formats: string[], stats: FormatStat[]) {
  const start = planWeek(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const open = posts.filter((p) => !REJECTED.has(p.status));
  const taken = new Set(open.map((p) => p.day));
  const already = open.filter((p) => p.day >= start && p.day < addDays(start, 7)).length;
  const free = days.filter((d) => d >= today && !taken.has(d)).slice(0, Math.max(0, target - already));
  const picked = pickFormats(formats, stats, free.length);
  return free.map((day, i) => ({ day, format: picked[i] }));
}

/** Pure: one Posting.md row for a reviewed week. */
export function weekRow(start: string, posts: Linked[], plays: Map<string, number>, target: number) {
  const live = posts.filter((p) => LIVE.has(p.status) && p.day >= start && p.day < addDays(start, 7));
  const formats = [...new Set(live.map((p) => p.format ?? "no format"))].join(", ") || "-";
  const best = live
    .map((p) => ({ p, v: p.instagram ? plays.get(reelCode(p.instagram) ?? "") : undefined }))
    .filter((x): x is { p: Linked; v: number } => x.v !== undefined)
    .sort((a, b) => b.v - a.v)[0];
  return `| ${start} | ${live.length} | ${target} | ${live.length >= target ? "yes" : "no"} | ${formats} | ${best ? `${best.p.day} ${best.p.format ?? ""} (${best.v.toLocaleString("en-MY")})`.replace("  ", " ") : "-"} |`;
}

/** Pure: Posting.md with this week's row put in (replacing a row for the same week) and the formats table rewritten. */
export function upsertPosting(text: string, row: string, start: string, stats: FormatStat[]) {
  const [head] = (text || POSTING_HEADER).split("\n## Formats");
  const lines = head.replace(/\n+$/, "").split("\n");
  const at = lines.findIndex((l) => l.startsWith(`| ${start} |`));
  if (at >= 0) lines[at] = row;
  else lines.splice(lines.reduce((i, l, j) => (l.startsWith("| ") ? j : i), lines.length - 1) + 1, 0, row);
  const table = [
    "## Formats",
    "",
    "Median plays of live posts with an **Instagram:** link matched in the last reel check. Rewritten every Monday.",
    "",
    "| Format | Live | With plays | Median plays |",
    "| --- | --- | --- | --- |",
    ...stats.map((s) => `| ${s.format} | ${s.live} | ${s.withPlays} | ${s.median === null ? "-" : Math.round(s.median).toLocaleString("en-MY")} |`),
  ];
  return `${lines.join("\n")}\n\n${table.join("\n")}\n`;
}

export function readLinked(dir: string): Linked[] {
  return readBoard(dir).map((p) => {
    const text = readFileSync(join(dir, p.file), "utf8");
    const instagram = /\*\*Instagram:?\*\*:?[ \t]*(https:\/\/\S+)/.exec(text)?.[1];
    return { ...p, ...(instagram ? { instagram } : {}) };
  });
}

export const unavailable = (ctx: JobContext) => (existsSync(contentDir(ctx)) ? null : `no content folder at ${contentDir(ctx)}`);

export default async function run(ctx: JobContext): Promise<JobResult> {
  const folder = stationFolder(ctx.env, ctx.stateDir);
  mkdirSync(folder, { recursive: true });
  const formatsFile = join(folder, "Formats.md");
  if (!existsSync(formatsFile)) writeFileSync(formatsFile, FORMATS_TEMPLATE);
  const formats = parseFormats(readFileSync(formatsFile, "utf8"));

  const dir = contentDir(ctx);
  const today = mytDay(ctx.now);
  const target = postTarget(ctx.env);
  const posts = readLinked(dir);
  const snap = ctx.account.instagram ? readSnapshot(ctx.stateDir, ctx.account.instagram) : null;
  const plays = new Map((snap?.reels ?? []).map((r) => [reelCode(r.url) ?? "", r.views] as const));
  const stats = formatStats(posts, plays, formats);

  const reviewed = addDays(planWeek(today), -7);
  const row = weekRow(reviewed, posts, plays, target);
  const postingFile = join(folder, "Posting.md");
  writeFileSync(postingFile, upsertPosting(existsSync(postingFile) ? readFileSync(postingFile, "utf8") : "", row, reviewed, stats));

  let made = 0;
  for (const { day, format } of planSlots(posts, today, target, formats, stats)) {
    const dayDir = join(dir, day);
    mkdirSync(dayDir, { recursive: true });
    // Never overwrite: a post.md here without a status line is a note, so the slot gets its own file.
    const taken = existsSync(join(dayDir, "post.md"));
    const name = taken ? "slot.md" : "post.md";
    if (existsSync(join(dayDir, name))) continue;
    writeFileSync(join(dayDir, name), slotText(day, format));
    made++;
  }
  const live = Number(row.split("|")[2]);
  return {
    ok: true,
    message: `week of ${reviewed}: ${live} of ${target} live · ${plural(made, "slot")} planned for the week of ${planWeek(today)} · ${plural(formats.length, "format")}${snap ? "" : " · no reel check yet, formats unranked"}`,
  };
}

