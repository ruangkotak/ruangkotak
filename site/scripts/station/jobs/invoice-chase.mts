// Billing Clerk, 10:00 weekdays: which invoices are unpaid, and which are past due?
// Reads <vault>/Station/invoices.md (created on first run with instructions). Station's Invoice gate counts the unpaid
// ones; any invoice past its due date goes to Needs you.
// Station gets counts and totals; invoice numbers and client names stay in the file.
import { join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { INVOICES_TEMPLATE, parseInvoices, readOrCreate, total, withoutComments, type Invoice } from "../ledger.mts";
import { stationFolder } from "../queue.mts";
import { mytDay } from "./reminder-check.mts";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
    return chase(invoices, unreadable, today);
  } catch (err) {
    return { ok: false, message: `cannot read invoices.md: ${(err as Error).message}` };
  }
}
