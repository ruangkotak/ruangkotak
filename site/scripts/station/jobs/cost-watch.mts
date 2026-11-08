// Cost Analyst, Monday 09:00: what do the tools cost per month, what renews this week, and how much Apify has been used?
// Reads <vault>/Station/costs.md (created on first run with instructions). With APIFY_TOKEN set (the Instagram jobs
// already need it), it also reads this cycle's real Apify usage, since those jobs are what spend it.
// Renewals within 7 days and Apify above 80% of its monthly limit go to Needs you.
import { join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { COSTS_TEMPLATE, formatMoney, monthly, parseCosts, readOrCreate, total, withoutComments, type Cost } from "../ledger.mts";
import { stationFolder } from "../queue.mts";
import { mytDay } from "./reminder-check.mts";

export type ApifyUsage = { used: number; max: number | null } | "error" | null;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Pure: the Station result for the cost list, today's date and (optionally) Apify's usage this cycle. */
export function costReport(costs: Cost[], unreadable: number, today: string, apify: ApifyUsage): JobResult {
  const soon = costs.filter((c) => c.renews && c.renews >= today && c.renews <= addDays(today, 7));
  const parts = [costs.length ? `${plural(costs.length, "cost")} · ${total(costs.map(monthly))}/mo` : "no costs listed yet"];
  if (soon.length) parts.push(`${plural(soon.length, "renewal")} this week`);
  const attention: string[] = [];
  if (soon.length) attention.push(`${plural(soon.length, "renewal")} this week (${total(soon.map((c) => c.money))})`);
  if (apify === "error") parts.push("Apify usage unreadable");
  else if (apify) {
    const used = formatMoney({ currency: "USD", amount: Math.round(apify.used * 100) / 100 });
    parts.push(`Apify this cycle ${used}${apify.max ? ` of ${formatMoney({ currency: "USD", amount: apify.max })}` : ""}`);
    if (apify.max && apify.used / apify.max >= 0.8) attention.push(`Apify at ${Math.round((apify.used / apify.max) * 100)}% of its monthly limit`);
  }
  if (unreadable) parts.push(`${plural(unreadable, "line")} without an amount and /mo or /yr`);
  return { ok: true, message: parts.join(" · "), attention: attention.join("; ") || undefined };
}

async function apifyUsage(token: string | undefined): Promise<ApifyUsage> {
  if (!token) return null;
  try {
    const res = await fetch("https://api.apify.com/v2/users/me/limits", { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return "error";
    const d = ((await res.json()) as { data?: { current?: { monthlyUsageUsd?: number }; limits?: { maxMonthlyUsageUsd?: number } } }).data;
    const used = d?.current?.monthlyUsageUsd;
    return typeof used === "number" ? { used, max: d?.limits?.maxMonthlyUsageUsd ?? null } : "error";
  } catch {
    return "error";
  }
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const file = join(stationFolder(ctx.env, ctx.stateDir), "costs.md");
  try {
    const today = mytDay(ctx.now);
    const { costs, unreadable } = parseCosts(withoutComments(readOrCreate(file, COSTS_TEMPLATE)), today);
    return costReport(costs, unreadable, today, await apifyUsage(ctx.env.APIFY_TOKEN));
  } catch (err) {
    return { ok: false, message: `cannot read costs.md: ${(err as Error).message}` };
  }
}
