// Billing Clerk, every 15 minutes: which invoices are unpaid, and which are past due?
// Reads <vault>/Station/invoices.md (created on first run with instructions). Station's Invoice gate counts the unpaid
// ones; any invoice past its due date goes to Needs you.
// Station gets counts and totals; invoice numbers and client names stay in the file.
// A line ending in "job <reference>" is our commission on a talent job. Whether it is ticked here decides whether the
// board shows that job as received, so the references (and the paid date) are sent to Station: nothing else about the line.
import { join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { INVOICES_TEMPLATE, parseInvoices, readOrCreate, total, withoutComments, type Invoice } from "../ledger.mts";
import { plural, stationFolder } from "../queue.mts";
import { mytDay } from "./reminder-check.mts";


/** Pure: which talent-job references invoices.md shows as paid (with the date) and which as still open. */
export function jobSync(invoices: Invoice[]) {
  const paid = new Map<string, string | undefined>();
  const open = new Set<string>();
  for (const i of invoices) if (i.job) i.paid ? paid.set(i.job, i.paidOn ?? paid.get(i.job)) : open.add(i.job);
  return { paid: [...paid].map(([ref, on]) => (on ? { ref, on } : { ref })), open: [...open].filter((r) => !paid.has(r)) };
}

/** Pure: the Station result for a set of invoices on a Malaysia-time day. */
export function chase(invoices: Invoice[], unreadable: number, today: string): JobResult {
  const unpaid = invoices.filter((i) => !i.paid);
  const pastDue = unpaid.filter((i) => i.due && i.due < today);
  const parts = [unpaid.length ? `${unpaid.length} unpaid · ${total(unpaid.map((i) => i.money))} outstanding` : "no unpaid invoices"];
  if (pastDue.length) parts.push(`${pastDue.length} past due (${total(pastDue.map((i) => i.money))})`);
  if (unreadable) parts.push(`${plural(unreadable, "line")} without an amount`);
  return {
    ok: true,
    message: parts.join(" · "),
    attention: pastDue.length ? `${plural(pastDue.length, "invoice")} past due (${total(pastDue.map((i) => i.money))})` : undefined,
    // The gate only counts: lateness is the due date's job (past due → Needs you), so it is never flagged twice.
    gates: [{ gate: "invoice", waiting: unpaid.length }],
  };
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const file = join(stationFolder(ctx.env, ctx.stateDir), "invoices.md");
  try {
    const today = mytDay(ctx.now);
    const { invoices, unreadable } = parseInvoices(withoutComments(readOrCreate(file, INVOICES_TEMPLATE)), today);
    const result = chase(invoices, unreadable, today);
    const sync = jobSync(invoices);
    if (!sync.paid.length && !sync.open.length) return result;
    const res = await fetch(new URL("/api/station/clients", ctx.env.STATION_URL), {
      method: "POST", headers: { "content-type": "application/json", "x-station-key": ctx.env.STATION_KEY ?? "" },
      body: JSON.stringify({ action: "jobs-sync", ...sync }), signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ...result, ok: false, message: `${result.message} · KNOX refused the talent job update (${res.status})` };
    const { changed } = (await res.json()) as { changed?: number };
    return { ...result, message: `${result.message} · ${plural(sync.paid.length + sync.open.length, "talent job line")}${changed ? ` · ${changed} updated on the board` : ""}` };
  } catch (err) {
    return { ok: false, message: `cannot read invoices.md: ${(err as Error).message}` };
  }
}
