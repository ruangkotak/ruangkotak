// The CFO's plain-text ledgers, kept in <vault>/Station (or the state folder without a vault):
//   invoices.md  - [ ] INV-012 · client-demo · RM 3,500 · sent 2026-11-01 · due 2026-11-20
//                - [x] INV-011 · brand x · RM 2,000 · sent 2026-10-01 · due 2026-10-15 · paid 2026-10-14
//   costs.md     - Apify · USD 49/mo · renews 2026-11-15
//                - Domain · RM 60/yr · renews 2027-03-01
// Amounts: RM / MYR / USD / $ / SGD / S$ before or after the number, commas allowed. Dates read like TASKS.md dates.
// Lines that cannot be read are counted and reported, never guessed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseDay } from "./jobs/reminder-check.mts";

export type Money = { currency: string; amount: number };
export type Invoice = { paid: boolean; label: string; money: Money; sent?: string; due?: string; paidOn?: string };
export type Cost = { label: string; money: Money; per: "mo" | "yr"; renews?: string };

const CUR: Record<string, string> = { rm: "MYR", myr: "MYR", usd: "USD", $: "USD", "us$": "USD", sgd: "SGD", s$: "SGD" };
const SYMBOL: Record<string, string> = { MYR: "RM ", USD: "$", SGD: "S$" };

export function parseMoney(text: string): Money | null {
  const before = /(?:^|[\s·(])(rm|myr|usd|us\$|sgd|s\$|\$)\s?(\d[\d,]*(?:\.\d+)?)(?![\d,])/i.exec(text);
  const after = /(?:^|[\s·(])(\d[\d,]*(?:\.\d+)?)\s?(rm|myr|usd|sgd)\b/i.exec(text);
  const [cur, num] = before ? [before[1], before[2]] : after ? [after[2], after[1]] : [];
  if (!cur || !num) return null;
  return { currency: CUR[cur.toLowerCase()], amount: Number(num.replace(/,/g, "")) };
}

export function formatMoney(m: Money) {
  const abs = Math.abs(m.amount);
  const n = abs.toLocaleString("en-US", { maximumFractionDigits: abs % 1 ? 2 : 0, minimumFractionDigits: abs % 1 ? 2 : 0 });
  return `${m.amount < 0 ? "−" : ""}${SYMBOL[m.currency] ? `${SYMBOL[m.currency]}${n}` : `${m.currency} ${n}`}`;
}

/** Sums per currency, biggest first, as "RM 8,500 + $49". "nothing" when empty. */
export function total(items: Money[]) {
  const by = new Map<string, number>();
  for (const m of items) by.set(m.currency, (by.get(m.currency) ?? 0) + m.amount);
  const parts = [...by].sort((a, b) => b[1] - a[1]).map(([currency, amount]) => formatMoney({ currency, amount: Math.round(amount * 100) / 100 }));
  return parts.length ? parts.join(" + ") : "nothing";
}

const field = (line: string, word: string, today: string) => {
  const m = new RegExp(`\\b${word}:?\\s+([^·,;()]+)`, "i").exec(line);
  return m ? parseDay(m[1], today) : undefined;
};
const labelOf = (body: string) => body.split("·")[0].replace(/<!--.*-->/, "").trim();

export function parseInvoices(text: string, today: string): { invoices: Invoice[]; unreadable: number } {
  const invoices: Invoice[] = [];
  let unreadable = 0;
  for (const line of text.split("\n")) {
    const m = /^\s*[-*] \[( |x|X)\] (.+)$/.exec(line);
    if (!m) continue;
    const money = parseMoney(m[2]);
    if (!money) {
      unreadable++;
      continue;
    }
    invoices.push({ paid: m[1] !== " ", label: labelOf(m[2]), money, sent: field(m[2], "sent", today), due: field(m[2], "due", today), paidOn: field(m[2], "paid", today) });
  }
  return { invoices, unreadable };
}

export function parseCosts(text: string, today: string): { costs: Cost[]; unreadable: number } {
  const costs: Cost[] = [];
  let unreadable = 0;
  for (const line of text.split("\n")) {
    const m = /^\s*[-*] (?!\[)(.+)$/.exec(line);
    if (!m) continue;
    const money = parseMoney(m[1]);
    const per = /\/\s?(yr|year|annual)|\b(yearly|annually|per year)\b/i.test(m[1]) ? "yr" : /\/\s?(mo|month)|\b(monthly|per month)\b/i.test(m[1]) ? "mo" : null;
    if (!money || !per) {
      unreadable++;
      continue;
    }
    costs.push({ label: labelOf(m[1]), money, per, renews: field(m[1], "renews", today) });
  }
  return { costs, unreadable };
}

export const monthly = (c: Cost): Money => ({ currency: c.money.currency, amount: c.per === "yr" ? c.money.amount / 12 : c.money.amount });

/** Reads a ledger, creating it with its instructions the first time. */
export function readOrCreate(path: string, template: string): string {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, template);
  }
  return readFileSync(path, "utf8");
}

export const INVOICES_TEMPLATE = `# Invoices

One line per invoice. Tick it when paid and add "paid <date>". Station counts the unticked ones (gate: Invoice);
anything past its due date goes to Needs you.

<!-- Example (lines inside this comment are ignored):
- [ ] INV-012 · client-demo · RM 3,500 · sent 2026-11-01 · due 2026-11-20
- [x] INV-011 · Brand X · RM 2,000 · sent 2026-10-01 · due 2026-10-15 · paid 2026-10-14
-->

`;

export const COSTS_TEMPLATE = `# Costs

One line per tool, subscription or recurring cost, with /mo or /yr. Add "renews <date>" to be warned a week ahead.

<!-- Example (lines inside this comment are ignored):
- Apify · USD 49/mo · renews 2026-11-15
- Domain · RM 60/yr · renews 2027-03-01
-->

`;

/** Drops HTML comments, so template examples are never read as real lines. */
export const withoutComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, "");
