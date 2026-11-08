// Controller, Monday 09:30: the books at a glance.
// From invoices.md and costs.md, writes <vault>/Station/Finance.md (replaced each run): paid this month and last,
// invoiced this month, outstanding, monthly costs, and what is left after costs. Station gets the one-line summary.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { COSTS_TEMPLATE, INVOICES_TEMPLATE, monthly, parseCosts, parseInvoices, readOrCreate, total, withoutComments, type Cost, type Invoice, type Money } from "../ledger.mts";
import { stationFolder } from "../queue.mts";
import { mytDay } from "./reminder-check.mts";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const prevMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** Money left after costs, per currency; only meaningful where a currency has both. */
function net(paid: Money[], costs: Money[]) {
  const by = new Map<string, number>();
  for (const m of paid) by.set(m.currency, (by.get(m.currency) ?? 0) + m.amount);
  for (const m of costs) by.set(m.currency, (by.get(m.currency) ?? 0) - m.amount);
  return total([...by].map(([currency, amount]) => ({ currency, amount })));
}

/** Pure: the Station result and the Finance note. */
export function books(invoices: Invoice[], costs: Cost[], today: string, stamp: string) {
  const ym = today.slice(0, 7);
  const last = prevMonth(ym);
  const paidIn = (m: string) => invoices.filter((i) => i.paid && i.paidOn?.startsWith(m)).map((i) => i.money);
  const invoiced = invoices.filter((i) => i.sent?.startsWith(ym)).map((i) => i.money);
  const outstanding = invoices.filter((i) => !i.paid).map((i) => i.money);
  const runRate = costs.map(monthly);
  const undated = invoices.filter((i) => i.paid && !i.paidOn).length;
  const month = MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3);
  const message = `${month}: ${total(paidIn(ym))} paid · ${total(invoiced)} invoiced · ${total(outstanding)} outstanding · costs ${total(runRate)}/mo`;
  const note = [
    `# Finance`,
    ``,
    `${stamp} (Malaysia time), from invoices.md and costs.md. Rewritten every Monday; edit those files, not this note.`,
    ``,
    `| | ${monthName(ym)} (to date) | ${monthName(last)} |`,
    `| --- | --- | --- |`,
    `| Paid | ${total(paidIn(ym))} | ${total(paidIn(last))} |`,
    `| Invoiced | ${total(invoiced)} | ${total(invoices.filter((i) => i.sent?.startsWith(last)).map((i) => i.money))} |`,
    `| Costs per month | ${total(runRate)} | |`,
    `| Paid minus a month of costs | ${net(paidIn(ym), runRate)} | ${net(paidIn(last), runRate)} |`,
    ``,
    `**Outstanding:** ${total(outstanding)} across ${outstanding.length} invoice${outstanding.length === 1 ? "" : "s"}.`,
    undated ? `\n${undated} paid invoice${undated === 1 ? " has" : "s have"} no "paid <date>", so ${undated === 1 ? "it is" : "they are"} not in any month above.` : "",
    ``,
  ].join("\n");
  return { result: { ok: true, message } as JobResult, note };
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const folder = stationFolder(ctx.env, ctx.stateDir);
  try {
    const today = mytDay(ctx.now);
    const { invoices } = parseInvoices(withoutComments(readOrCreate(join(folder, "invoices.md"), INVOICES_TEMPLATE)), today);
    const { costs } = parseCosts(withoutComments(readOrCreate(join(folder, "costs.md"), COSTS_TEMPLATE)), today);
    const stamp = new Date(ctx.now.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
    const { result, note } = books(invoices, costs, today, stamp);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "Finance.md"), note);
    return result;
  } catch (err) {
    return { ok: false, message: `cannot build the summary: ${(err as Error).message}` };
  }
}
