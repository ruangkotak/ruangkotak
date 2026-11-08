// Payroll & KPI, 10:30 weekdays: who is owed, and is anyone about to be paid late?
// Reads <vault>/Station/payroll.md (created on first run with instructions): one checklist line per payout, ticked when
// paid. Payouts due within 3 days, or already late, go to Needs you. Station gets counts and totals only: never names,
// never one person's amount. Statutory contributions (EPF, SOCSO, EIS) are not calculated; enter what you actually pay.
import { join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { PAYROLL_TEMPLATE, parseInvoices, readOrCreate, total, withoutComments, type Invoice } from "../ledger.mts";
import { stationFolder } from "../queue.mts";
import { mytDay } from "./reminder-check.mts";

const SOON_DAYS = 3;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Pure: the Station result for the payroll list on a Malaysia-time day. */
export function payrollCheck(payouts: Invoice[], unreadable: number, today: string): JobResult {
  const unpaid = payouts.filter((p) => !p.paid);
  const late = unpaid.filter((p) => p.due && p.due < today);
  const soon = unpaid.filter((p) => p.due && p.due >= today && p.due <= addDays(today, SOON_DAYS));
  const paidThisMonth = payouts.filter((p) => p.paid && p.paidOn?.startsWith(today.slice(0, 7)));
  const parts = [unpaid.length ? `${plural(unpaid.length, "payout")} unpaid · ${total(unpaid.map((p) => p.money))}` : "no unpaid payouts"];
  if (soon.length) parts.push(`${soon.length} due within ${SOON_DAYS} days`);
  if (late.length) parts.push(`${late.length} late`);
  parts.push(`paid this month ${total(paidThisMonth.map((p) => p.money))}`);
  if (unreadable) parts.push(`${plural(unreadable, "line")} without an amount`);
  const attention = [
    late.length && `${plural(late.length, "payout")} late (${total(late.map((p) => p.money))})`,
    soon.length && `${plural(soon.length, "payout")} due within ${SOON_DAYS} days (${total(soon.map((p) => p.money))})`,
  ].filter(Boolean).join("; ");
  return { ok: true, message: parts.join(" · "), attention: attention || undefined };
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const file = join(stationFolder(ctx.env, ctx.stateDir), "payroll.md");
  try {
    const today = mytDay(ctx.now);
    const { invoices: payouts, unreadable } = parseInvoices(withoutComments(readOrCreate(file, PAYROLL_TEMPLATE)), today);
    return payrollCheck(payouts, unreadable, today);
  } catch (err) {
    return { ok: false, message: `cannot read payroll.md: ${(err as Error).message}` };
  }
}
