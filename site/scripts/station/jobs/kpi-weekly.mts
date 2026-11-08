// Payroll & KPI, Monday 10:00: one row a week of the numbers that matter.
// Reads the site funnel for the last 7 days from Station itself (/api/station/state, owner key) and revenue paid this
// month from invoices.md, then adds or updates this week's row in <vault>/Station/KPI.md. Payroll lives in Finance.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { INVOICES_TEMPLATE, parseInvoices, readOrCreate, total, withoutComments } from "../ledger.mts";
import { stationFolder } from "../queue.mts";
import { mytDay } from "./reminder-check.mts";

const STEPS = ["home_view", "preview_started", "preview_completed", "report_viewed", "apply_submitted"] as const;
export type Week = Record<(typeof STEPS)[number], number>;

const HEADER = `# KPI

One row per week, added every Monday. Funnel numbers are the site's last 7 days; Paid is the month to date from invoices.md.
Payroll: see Finance.md (from payroll.md).

| Week of | Home | Previews | Done | Reports | Applications | Paid (month to date) |
| --- | --- | --- | --- | --- | --- | --- |
`;

export function weekTotals(days: Record<string, number | string>[]): Week {
  return Object.fromEntries(STEPS.map((s) => [s, days.reduce((n, d) => n + Number(d[s] ?? 0), 0)])) as Week;
}

/** Pure: puts this week's row into the KPI note, replacing a row for the same date. */
export function upsertRow(text: string, row: string, week: string) {
  const lines = (text || HEADER).split("\n");
  const at = lines.findIndex((l) => l.startsWith(`| ${week} |`));
  if (at >= 0) lines[at] = row;
  else {
    const lastRow = lines.reduce((i, l, j) => (l.startsWith("| ") ? j : i), -1);
    lines.splice(lastRow + 1, 0, row);
  }
  return lines.join("\n");
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const folder = stationFolder(ctx.env, ctx.stateDir);
  const file = join(folder, "KPI.md");
  try {
    const res = await fetch(new URL("/api/station/state", ctx.env.STATION_URL), { headers: { "x-station-key": ctx.env.STATION_KEY ?? "" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ok: false, message: `Station answered ${res.status}` };
    const funnel = ((await res.json()) as { funnel?: { status: string; days: Record<string, number | string>[] } }).funnel;
    if (funnel?.status !== "ok") return { ok: false, message: `site funnel is ${funnel?.status ?? "missing"}` };
    const w = weekTotals(funnel.days);
    const today = mytDay(ctx.now);
    const { invoices } = parseInvoices(withoutComments(readOrCreate(join(folder, "invoices.md"), INVOICES_TEMPLATE)), today);
    const paid = total(invoices.filter((i) => i.paid && i.paidOn?.startsWith(today.slice(0, 7))).map((i) => i.money));
    const row = `| ${today} | ${w.home_view} | ${w.preview_started} | ${w.preview_completed} | ${w.report_viewed} | ${w.apply_submitted} | ${paid} |`;
    mkdirSync(folder, { recursive: true });
    writeFileSync(file, upsertRow(existsSync(file) ? readFileSync(file, "utf8") : "", row, today));
    return {
      ok: true,
      message: `7 days: ${w.home_view} home → ${w.preview_started} previews → ${w.report_viewed} reports → ${w.apply_submitted} applications · paid this month ${paid}`,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
