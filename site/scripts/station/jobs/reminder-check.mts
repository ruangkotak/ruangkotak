// Digest Editor, 08:00 and 20:00 Malaysia time: what in TASKS.md is late, due, or waiting too long?
// Reads the task list the productivity plugin keeps (repo-root TASKS.md, or STATION_TASKS_FILE), using its format:
//   - [ ] **Title** - context, for whom, due 12 Nov          (Active)
//   - [ ] **Title** - since 2026-11-01                       (Waiting On)
// Writes a digest note (overdue, due today, due tomorrow, waiting over a week, every Station checklist) to
// <vault>/Station/Digest.md, or the state folder without a vault, and replaces it each run.
// Station gets counts only. Overdue tasks and long waits go to Needs you; the job itself only fails if it cannot read.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { allQueues, stationFolder } from "../queue.mts";

const WAIT_DAYS = 7;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export type Task = { title: string; section: string; due?: string; since?: string };

export const tasksFile = (ctx: Pick<JobContext, "env" | "repo">) =>
  ctx.env.STATION_TASKS_FILE ?? [join(ctx.repo, "TASKS.md"), ctx.env.STATION_VAULT_DIR && join(ctx.env.STATION_VAULT_DIR, "TASKS.md")].find((p) => p && existsSync(p)) ?? join(ctx.repo, "TASKS.md");

export const unavailable = (ctx: JobContext) => (existsSync(tasksFile(ctx)) ? null : `no task list at ${tasksFile(ctx)} (set --tasks)`);

/** Malaysia-time calendar date (YYYY-MM-DD) of an instant. */
export const mytDay = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");

/** Reads "2026-11-12", "12 Nov", "Nov 12, 2026", "today", "tomorrow", "Friday". A date without a year that would be
 *  more than two months back is taken as next year's. Unreadable text gives undefined, never a guess. */
export function parseDay(raw: string, today: string): string | undefined {
  const t = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/[.,]/g, " ").replace(/\s+/g, " ");
  if (/^today\b/.test(t)) return today;
  if (/^(tomorrow|tmrw)\b/.test(t)) return addDays(today, 1);
  const iso = /^(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dow = DAYS.findIndex((d) => t.startsWith(d));
  if (dow >= 0) {
    const now = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDays(today, (dow - now + 7) % 7);
  }
  const dm = /^(\d{1,2}) ([a-z]{3})[a-z]*(?: (\d{4}))?\b/.exec(t);
  const md = /^([a-z]{3})[a-z]* (\d{1,2})(?: (\d{4}))?\b/.exec(t);
  const [d, mon, y] = dm ? [dm[1], dm[2], dm[3]] : md ? [md[2], md[1], md[3]] : [];
  const m = mon ? MONTHS.indexOf(mon) : -1;
  if (m < 0 || !d || Number(d) > 31) return undefined;
  let year = y ? Number(y) : Number(today.slice(0, 4));
  let day = `${year}-${pad(m + 1)}-${pad(Number(d))}`;
  if (!y && day < addDays(today, -60)) day = `${++year}-${pad(m + 1)}-${pad(Number(d))}`;
  return day;
}

/** Open tasks in Active and Waiting On (Someday and Done are left alone), with any due/since date read. */
export function parseTasks(text: string, today: string): Task[] {
  const out: Task[] = [];
  let section = "";
  for (const line of text.split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      section = h[1].toLowerCase();
      continue;
    }
    const m = /^\s*[-*] \[ \] (.+)$/.exec(line);
    if (!m || !/^(active|waiting)/.test(section)) continue;
    const body = m[1];
    const title = (/\*\*(.+?)\*\*/.exec(body)?.[1] ?? body.split(" - ")[0]).trim();
    const due = /\bdue(?: by| on)?:?\s+([^,;()]+)/i.exec(body)?.[1];
    const since = /\bsince:?\s+([^,;()]+)/i.exec(body)?.[1];
    out.push({ title, section: section.startsWith("waiting") ? "waiting" : "active", due: due && parseDay(due, today), since: since && parseDay(since, today) });
  }
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()][0].toUpperCase()}${DAYS[d.getUTCDay()].slice(1)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()][0].toUpperCase()}${MONTHS[d.getUTCMonth()].slice(1)}`;
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

/** Pure: the Station result and the digest note for a task list on a given Malaysia-time day. */
export function digest(tasks: Task[], today: string, queues: { file: string; waiting: number }[], source: string, stamp: string) {
  const tomorrow = addDays(today, 1);
  const open = tasks.filter((t) => t.section === "active");
  const waiting = tasks.filter((t) => t.section === "waiting");
  const overdue = tasks.filter((t) => t.due && t.due < today).sort((a, b) => a.due!.localeCompare(b.due!));
  const dueToday = tasks.filter((t) => t.due === today);
  const dueTomorrow = tasks.filter((t) => t.due === tomorrow);
  const stale = waiting.filter((t) => t.since && daysBetween(t.since, today) > WAIT_DAYS);

  const parts = [`${open.length} active`];
  if (overdue.length) parts.push(`${overdue.length} overdue`);
  if (dueToday.length) parts.push(`${dueToday.length} due today`);
  if (dueTomorrow.length) parts.push(`${dueTomorrow.length} due tomorrow`);
  parts.push(`${waiting.length} waiting${stale.length ? ` (${stale.length} over ${WAIT_DAYS} days)` : ""}`);
  const attention = [overdue.length && plural(overdue.length, "overdue task"), stale.length && `${plural(stale.length, "task")} waiting over ${WAIT_DAYS} days`]
    .filter(Boolean)
    .join(", ");

  const list = (xs: Task[], note: (t: Task) => string) => (xs.length ? xs.map((t) => `- **${t.title}**${note(t)}`).join("\n") : "- nothing");
  const note = [
    `# Station digest`,
    ``,
    `${stamp} (Malaysia time) from \`${source}\`. Rewritten at 08:00 and 20:00; edit TASKS.md, not this note.`,
    ``,
    `## Overdue`,
    list(overdue, (t) => ` (due ${shortDay(t.due!)}, ${plural(daysBetween(t.due!, today), "day")} late)`),
    ``,
    `## Due today (${shortDay(today)})`,
    list(dueToday, () => ""),
    ``,
    `## Due tomorrow`,
    list(dueTomorrow, () => ""),
    ``,
    `## Waiting over ${WAIT_DAYS} days`,
    list(stale, (t) => ` (since ${shortDay(t.since!)})`),
    ``,
    `## Checklists`,
    queues.length ? queues.map((q) => `- ${q.file}: ${q.waiting} waiting`).join("\n") : "- none yet",
    ``,
  ].join("\n");
  return { result: { ok: true, message: parts.join(" · "), attention: attention || undefined } as JobResult, note };
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const file = tasksFile(ctx);
  try {
    const today = mytDay(ctx.now);
    const folder = stationFolder(ctx.env, ctx.stateDir);
    const stamp = new Date(ctx.now.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
    const { result, note } = digest(parseTasks(readFileSync(file, "utf8"), today), today, allQueues(folder), basename(file), stamp);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "Digest.md"), note);
    return result;
  } catch (err) {
    return { ok: false, message: `cannot read ${basename(file)}: ${(err as Error).message}` };
  }
}
