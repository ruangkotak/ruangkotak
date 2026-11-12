import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnvFile } from "../scripts/station/client.mts";
import { verdict } from "../scripts/station/jobs/backup-freshness-guard.mts";
import { findSecrets } from "../scripts/station/jobs/credential-registry.mts";
import { describe } from "../scripts/station/jobs/sync-watchdog.mts";
import { isConflict } from "../scripts/station/jobs/vault-conflict-scan.mts";
import { compact, type ReelSnapshot } from "../scripts/station/apify.mts";
import { fill, keywordsOf, matches, MESSAGE_TEMPLATE, messageFrom, planSends, queueLine, readQueue, withoutErrorItems, type Comment } from "../scripts/station/jobs/ig-comment-dm.mts";
import { tickLine } from "../scripts/station/queue.mts";
import { datesOf, labelOf, review as finalReview } from "../scripts/station/jobs/final-check.mts";
import { agentInstructions, asksToWork, BLOCKED, claudeArgs, promptFor, TOOLS } from "../scripts/station/jobs/agent-work.mts";
import { velocity } from "../scripts/station/jobs/ig-velocity.mts";
import { briefLine } from "../scripts/station/jobs/brief-sweep.mts";
import { hasStatus, readBoard, review, statusOf, type Post } from "../scripts/station/jobs/board-completeness.mts";
import { deskFor, route, type DeskRef } from "../scripts/station/jobs/route-asks.mts";
import { markNewLines, markerOf } from "../scripts/station/queue.mts";
import { formatMoney, parseCosts, parseInvoices, parseMoney, total, withoutComments, INVOICES_TEMPLATE, COSTS_TEMPLATE } from "../scripts/station/ledger.mts";
import { chase } from "../scripts/station/jobs/invoice-chase.mts";
import { costReport } from "../scripts/station/jobs/cost-watch.mts";
import { books } from "../scripts/station/jobs/books-summary.mts";
import { upsertRow, weekTotals } from "../scripts/station/jobs/kpi-weekly.mts";
import { payrollCheck } from "../scripts/station/jobs/payroll-check.mts";
import { PAYROLL_TEMPLATE } from "../scripts/station/ledger.mts";
import { readFileSync } from "node:fs";
import { digest, mytDay, parseDay, parseTasks } from "../scripts/station/jobs/reminder-check.mts";

const NOW = Date.parse("2026-11-08T09:00:00Z");
const hoursAgo = (h: number) => NOW - h * 3600_000;

test("env files are read with quotes stripped and junk ignored", () => {
  assert.deepEqual(parseEnvFile(`# comment\nSTATION_KEY=abc\nSTATION_URL="https://x.test"\n bad line\nEMPTY=\n`), {
    STATION_KEY: "abc", STATION_URL: "https://x.test", EMPTY: "",
  });
});

test("backup guard passes when everything is pushed", () => {
  assert.deepEqual(verdict([], [], NOW), { ok: true, message: "everything is on GitHub" });
});

test("backup guard reports fresh local work without failing", () => {
  const r = verdict([hoursAgo(2)], [hoursAgo(1), hoursAgo(3)], NOW);
  assert.equal(r.ok, true);
  assert.equal(r.message, "1 unpushed commit (oldest 2h), 2 uncommitted files (oldest 3h)");
});

test("backup guard fails once local-only work is over a day old", () => {
  assert.equal(verdict([hoursAgo(30)], [], NOW).ok, false);
  assert.match(verdict([], [hoursAgo(25)], NOW).message, /older than 24h, push it/);
});

test("sync watchdog describes the branch state in one line", () => {
  assert.equal(describe("main", 0, 0, 0), "main · in sync · clean");
  assert.equal(describe("main", 2, 1, 1), "main · 2 ahead, 1 behind · 1 changed file");
});

test("secret scan names the file and kind, never the value", () => {
  const known = new Map([["fake-station-key-for-tests-0001", "STATION_KEY"]]);
  const hits = findSecrets("site/lib/x.ts", `const k = "fake-station-key-for-tests-0001"; // ghp_${"a".repeat(36)}`, known);
  assert.deepEqual(hits, ["site/lib/x.ts: GitHub token", "site/lib/x.ts: value of STATION_KEY"]);
  assert.ok(hits.every((h) => !h.includes("fake-station-key")));
});

test("secret scan flags tracked env files but allows .env.example", () => {
  assert.deepEqual(findSecrets("site/.env.local", "", new Map()), ["site/.env.local: env file is tracked"]);
  assert.deepEqual(findSecrets("site/.env.example", "UPSTASH_REDIS_REST_TOKEN=", new Map()), []);
});

test("secret scan stays quiet on ordinary code", () => {
  assert.deepEqual(findSecrets("site/lib/store.ts", 'headers: { authorization: `Bearer ${TOKEN}` }', new Map()), []);
});

test("vault scan catches sync conflict copies, not ordinary note names", () => {
  for (const name of [
    "Plan (conflicted copy 2026-11-07).md",
    "Plan (Alan's MacBook conflicted copy 2026-11-07).md",
    "Plan.sync-conflict-20261107-101010-ABCDEFG.md",
    "Plan (conflict 2026-11-07 10.10.10).md",
  ]) assert.ok(isConflict(name), name);
  for (const name of ["Chapter 2.md", "Meeting (2).md", "Conflict resolution tips.md", "Q3 plan.md"]) assert.ok(!isConflict(name), name);
});

// ---------- Instagram ----------

const at = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const snap = (hAgo: number, reels: [string, number, number][]): ReelSnapshot => ({
  handle: "alanazizreview", at: at(hAgo), reels: reels.map(([url, ageH, views]) => ({ url, at: at(ageH), views })),
});

test("plays are compacted the way people read them", () => {
  assert.deepEqual([999, 1234, 12_345, 1_234_567, 12_345_678].map(compact), ["999", "1.2k", "12k", "1.2M", "12M"]);
});

test("the first velocity run only saves a baseline", () => {
  const r = velocity(null, snap(0, [["a", 5, 1200], ["b", 30, 9000]]));
  assert.equal(r.ok, true);
  assert.equal(r.message, "@alanazizreview · 2 reels · newest 5h old: 1.2k plays · baseline saved, rates from next run");
});

test("velocity reports plays per hour since the last snapshot and the fastest older reel", () => {
  const prev = snap(6, [["a", 5, 200], ["b", 30, 5000], ["c", 80, 9000]]);
  const cur = snap(0, [["a", 11, 1400], ["b", 36, 8600], ["c", 86, 9100]]);
  assert.equal(velocity(prev, cur).message, "@alanazizreview · 3 reels · newest 11h old: 1.4k plays (+200/h) · fastest: 36h-old reel +600/h");
});

test("an older newest reel is compared with the median of the rest", () => {
  const cur = snap(0, [["a", 72, 3000], ["b", 100, 1000], ["c", 130, 2000], ["d", 160, 1500]]);
  assert.match(velocity(null, cur).message, /newest 3d old: 3\.0k plays · 2\.0× median/);
});

test("no reels is a failure, so a private or renamed account shows up in Needs you", () => {
  assert.equal(velocity(null, snap(0, [])).ok, false);
});

test("keywords match whole words in any case", () => {
  const k = keywordsOf(" AUDIT, kotak ,");
  assert.deepEqual(k, ["AUDIT", "kotak"]);
  assert.ok(matches("audit please 🙏", k));
  assert.ok(matches("Nak KOTAK!", k));
  assert.ok(!matches("the auditorium was full", k));
  assert.ok(!matches("great reel", k));
});

test("the DM queue counts only unticked boxes, and a comment cannot break its line", () => {
  const c = { id: "c1", user: "someone", text: "AUDIT\nplease --> <!-- x", at: "2026-11-08T01:00:00.000Z", post: "https://www.instagram.com/reel/abc/" };
  const line = queueLine(c);
  assert.equal(line.split("\n").length, 1);
  assert.match(line, /^- \[ \] 2026-11-08 09:00 · @someone · "AUDIT please x" · https:\/\/www\.instagram\.com\/reel\/abc\/ <!-- rk:id=c1 at=2026-11-08T01:00:00\.000Z -->$/);
  const done = queueLine({ ...c, id: "c2", at: "2026-11-07T01:00:00.000Z" }).replace("- [ ]", "- [x]");
  const older = queueLine({ ...c, id: "c3", at: "2026-11-06T01:00:00.000Z" });
  assert.deepEqual(readQueue(["# heading", line, done, older, "a note I wrote"].join("\n")), { waiting: 2, oldestAt: "2026-11-06T01:00:00.000Z" });
});

// ---------- COO ----------

test("task dates read the ways people write them", () => {
  const today = "2026-11-08"; // a Sunday
  const cases: [string, string | undefined][] = [
    ["2026-11-12", "2026-11-12"], ["12 Nov", "2026-11-12"], ["Nov 12, 2026", "2026-11-12"], ["12th November", "2026-11-12"],
    ["today", "2026-11-08"], ["tomorrow", "2026-11-09"], ["Friday", "2026-11-13"], ["sunday", "2026-11-08"],
    ["Jan 5", "2027-01-05"], // more than two months back this year, so next year
    ["5 Oct", "2026-10-05"], // a month ago stays this year: it is overdue
    ["soon", undefined], ["the launch", undefined], ["35 Nov", undefined],
  ];
  for (const [raw, want] of cases) assert.equal(parseDay(raw, today), want, raw);
});

test("Malaysia-time day rolls over at 16:00 UTC", () => {
  assert.equal(mytDay(new Date("2026-11-08T15:59:00Z")), "2026-11-08");
  assert.equal(mytDay(new Date("2026-11-08T16:00:00Z")), "2026-11-09");
});

const TASKS = `# Tasks

## Active
- [ ] **Send Brand X proposal** - for Brand X, due 6 Nov
- [ ] **Edit reel 14** - due today
- [ ] **Book shoot** - due tomorrow
- [ ] **Plan Q1** - no date
- [x] ~~Old thing~~ (2026-11-01)

## Waiting On
- [ ] **Invoice from editor** - since 2026-10-20
- [ ] **Client feedback** - since 2026-11-05

## Someday
- [ ] **Podcast** - due 1 Nov

## Done
- [x] ~~Shipped~~ (2026-11-02)
`;

test("only open Active and Waiting On tasks count; Someday and Done are left alone", () => {
  const t = parseTasks(TASKS, "2026-11-08");
  assert.deepEqual(t.map((x) => x.title), ["Send Brand X proposal", "Edit reel 14", "Book shoot", "Plan Q1", "Invoice from editor", "Client feedback"]);
  assert.equal(t[0].due, "2026-11-06");
  assert.equal(t[4].since, "2026-10-20");
});

test("the digest counts for Station and lists for the note, and only lateness needs you", () => {
  const { result, note } = digest(parseTasks(TASKS, "2026-11-08"), "2026-11-08", [{ file: "dm-queue-alanazizreview.md", waiting: 2 }], "TASKS.md", "2026-11-08 08:00");
  assert.equal(result.message, "4 active · 1 overdue · 1 due today · 1 due tomorrow · 2 waiting (1 over 7 days)");
  assert.equal(result.attention, "1 overdue task, 1 task waiting over 7 days");
  assert.ok(!result.message.includes("Brand X") && !result.attention!.includes("Brand X"), "task text stays in the note");
  assert.match(note, /## Overdue\n- \*\*Send Brand X proposal\*\* \(due Fri 6 Nov, 2 days late\)/);
  assert.match(note, /- dm-queue-alanazizreview\.md: 2 waiting/);
  const calm = digest(parseTasks("## Active\n- [ ] **Plan Q1**\n", "2026-11-08"), "2026-11-08", [], "TASKS.md", "x").result;
  assert.equal(calm.attention, undefined);
});

test("a brief line carries what is needed to reply with a quote and nothing that identifies how to reach them", () => {
  const line = briefLine({ id: "2026-11-07T01:00:00.000Z:ab12", at: "2026-11-07T01:00:00.000Z", handle: "@someone", platform: "Instagram", niche: "food", views: "10k", goal: "more <!-- bookings -->" });
  assert.equal(line, '- [ ] 2026-11-07 09:00 · @someone · Instagram · food · 10k views · goal: "more bookings" <!-- rk:id=2026-11-07T01:00:00.000Z:ab12 at=2026-11-07T01:00:00.000Z -->');
  assert.deepEqual(readQueue(line), { waiting: 1, oldestAt: "2026-11-07T01:00:00.000Z" });
});

// ---------- remaining jobs ----------

test("post status is the first word after **Status:**", () => {
  assert.equal(statusOf("# Tue\n\n**Status:** DRAFT. Not published. Needs Alan's review."), "DRAFT");
  assert.equal(statusOf("**Status:** approved"), "APPROVED");
  assert.equal(statusOf("no status here"), "UNKNOWN");
  assert.equal(hasStatus("**Status:** DRAFT"), true);
  assert.equal(hasStatus("# Research notes, no status"), false);
});

test("the real post in content/ reads as a draft", () => {
  assert.equal(statusOf(readFileSync(new URL("../../content/2026-09-15/post.md", import.meta.url), "utf8")), "DRAFT");
});

test("the board review counts the week, the drafts, and flags drafts publishing within a day", () => {
  const p = (day: string, status: string): Post => ({ day, file: `${day}/post.md`, status, changedAt: `${day}T00:00:00.000Z` });
  const posts = [p("2026-11-01", "DRAFT"), p("2026-11-08", "DRAFT"), p("2026-11-09", "APPROVED"), p("2026-11-11", "DRAFT"), p("2026-11-20", "SCHEDULED")];
  const r = review(posts, "2026-11-08");
  assert.equal(r.message, "next 7 days: 3 posts on 3 of 7 days · 2 drafts waiting for review · 1 past draft never marked published");
  assert.equal(r.attention, "1 draft publishing within a day is not approved");
  assert.deepEqual(r.gates, [{ gate: "review", waiting: 2, oldestAt: "2026-11-08T00:00:00.000Z" }]);
  assert.equal(review([p("2026-11-12", "APPROVED")], "2026-11-08").attention, undefined);
});

test("hand-typed checklist lines get a marker once, and markers can carry extra fields", () => {
  const text = "# Final review\n\n- [ ] Reel 3 v2\n- [x] Reel 2 final\nsome note\n";
  const first = markNewLines(text, "2026-11-08T01:00:00.000Z");
  assert.equal(first.marked.length, 1);
  assert.match(first.text, /- \[ \] Reel 3 v2 <!-- rk:id=20261108010000-1 at=2026-11-08T01:00:00\.000Z -->/);
  assert.match(first.text, /- \[x\] Reel 2 final\nsome note/);
  assert.deepEqual(readQueue(first.text), { waiting: 1, oldestAt: "2026-11-08T01:00:00.000Z" });
  const again = markNewLines(first.text, "2026-11-08T05:00:00.000Z");
  assert.equal(again.marked.length, 0);
  assert.equal(again.text, first.text);
  assert.deepEqual(markerOf("- [ ] x <!-- rk:id=a1 at=2026-11-08T01:00:00Z desk=editor -->"), { id: "a1", at: "2026-11-08T01:00:00Z", desk: "editor" });
  assert.deepEqual(readQueue("- [ ] x <!-- rk:id=a1 at=2026-11-08T01:00:00Z desk=editor -->"), { waiting: 1, oldestAt: "2026-11-08T01:00:00Z" });
});

const DESKS: DeskRef[] = JSON.parse(readFileSync(new URL("../data/station/registry.json", import.meta.url), "utf8"))
  .departments.flatMap((d: { id: string; desks: { id: string; name: string }[] }) => d.desks.map((k) => ({ id: k.id, name: k.name, dept: d.id })));

test("asks go to a desk by #tag first, then by the first keyword", () => {
  const name = (t: string) => deskFor(t, DESKS)?.name ?? null;
  assert.equal(name("- [ ] cut the hook for reel 14"), "Editor");
  assert.equal(name("- [ ] fix captions on reel 3"), "Caption Editor");
  assert.equal(name("- [ ] send the invoice to client-demo"), "Billing Clerk");
  assert.equal(name("- [ ] reel thumbnail please #designer"), "Designer");
  assert.equal(name("- [ ] new idea #cdo"), "Art Director");
  assert.equal(name("- [ ] chase payment #billing-clerk"), "Billing Clerk");
  assert.equal(name("- [ ] call mum"), null);
});

test("routing marks new asks, retries unrouted ones only when they now match, and never rewrites for nothing", () => {
  const t0 = "2026-11-08T01:00:00.000Z";
  const r1 = route("# Asks\n\n- [ ] cut reel 14\n- [ ] call mum\n- [x] done thing\n", DESKS, t0);
  assert.deepEqual(r1.routed.map((d) => d.name), ["Editor"]);
  assert.equal(r1.open, 2);
  assert.equal(r1.unrouted, 1);
  assert.match(r1.text, /- \[ \] cut reel 14 · → Editor <!-- rk:id=\S+ at=2026-11-08T01:00:00\.000Z desk=editor -->/);
  assert.match(r1.text, /- \[ \] call mum · → \? \(add a #desk\) <!-- rk:id=\S+ at=\S+ desk=none -->/);
  const r2 = route(r1.text, DESKS, "2026-11-08T01:15:00.000Z");
  assert.equal(r2.changed, false, "an unrouted ask that still matches nothing is left alone");
  const tagged = r1.text.replace("call mum · → ? (add a #desk)", "call mum · → ? (add a #desk) #coo");
  const r3 = route(tagged, DESKS, "2026-11-08T01:30:00.000Z");
  assert.deepEqual(r3.routed.map((d) => d.name), ["COO Lead"]);
  assert.equal(r3.unrouted, 0);
  assert.match(r3.text, /call mum #coo · → COO Lead <!-- rk:id=\S+ at=\S+ desk=coo-lead -->/);
});

// ---------- CFO ----------

test("amounts read with the currency before or after, and format back the local way", () => {
  assert.deepEqual(parseMoney("INV-1 · RM 3,500 · due 20 Nov"), { currency: "MYR", amount: 3500 });
  assert.deepEqual(parseMoney("Apify · USD 49/mo"), { currency: "USD", amount: 49 });
  assert.deepEqual(parseMoney("tool · $12.50/mo"), { currency: "USD", amount: 12.5 });
  assert.deepEqual(parseMoney("1200 MYR"), { currency: "MYR", amount: 1200 });
  assert.equal(parseMoney("INV-2026-11 for Brand X"), null, "an invoice number is not an amount");
  assert.equal(formatMoney({ currency: "MYR", amount: 8500 }), "RM 8,500");
  assert.equal(formatMoney({ currency: "USD", amount: -49 }), "−$49");
  assert.equal(total([{ currency: "MYR", amount: 3500 }, { currency: "USD", amount: 49 }, { currency: "MYR", amount: 5000 }]), "RM 8,500 + $49");
  assert.equal(total([]), "nothing");
});

test("the ledger templates' examples are never read as real entries", () => {
  assert.deepEqual(parseInvoices(withoutComments(INVOICES_TEMPLATE), "2026-11-08"), { invoices: [], unreadable: 0 });
  assert.deepEqual(parseCosts(withoutComments(COSTS_TEMPLATE), "2026-11-08"), { costs: [], unreadable: 0 });
});

const INVOICES = `# Invoices
- [ ] INV-012 · client-demo · RM 3,500 · sent 2026-11-01 · due 2026-11-20
- [ ] INV-010 · Brand Y · RM 2,000 · sent 2026-10-01 · due 2026-10-15
- [x] INV-011 · Brand X · RM 5,000 · sent 2026-10-20 · due 2026-11-03 · paid 2026-11-02
- [x] INV-009 · Brand Z · RM 1,000 · paid 2026-10-10
- [ ] INV-013 · forgot the amount
`;
const COSTS = `- Apify · USD 49/mo · renews 2026-11-12
- Domain · RM 60/yr · renews 2027-03-01
- Canva · RM 55/mo · renews 2026-12-01
- mystery thing
`;

test("invoice chase counts unpaid, totals them, and sends past-due ones to Needs you", () => {
  const { invoices, unreadable } = parseInvoices(INVOICES, "2026-11-08");
  const r = chase(invoices, unreadable, "2026-11-08");
  assert.equal(r.message, "2 unpaid · RM 5,500 outstanding · 1 past due (RM 2,000) · 1 line without an amount");
  assert.equal(r.attention, "1 invoice past due (RM 2,000)");
  assert.deepEqual(r.gates, [{ gate: "invoice", waiting: 2 }]);
  assert.ok(!JSON.stringify(r).includes("Brand"), "client names stay in the file");
});

test("cost watch gives the monthly run-rate, this week's renewals and Apify usage", () => {
  const { costs, unreadable } = parseCosts(COSTS, "2026-11-08");
  const r = costReport(costs, unreadable, "2026-11-08", { used: 41.2, max: 49 });
  assert.equal(r.message, "3 costs · RM 60 + $49/mo · 1 renewal this week · Apify this cycle $41.20 of $49 · 1 line without an amount and /mo or /yr");
  assert.equal(r.attention, "1 renewal this week ($49); Apify at 84% of its monthly limit");
  assert.equal(costReport([], 0, "2026-11-08", null).message, "no costs listed yet");
  assert.match(costReport([], 0, "2026-11-08", "error").message, /Apify usage unreadable/);
});

test("the books summary splits this month from last and nets out a month of costs", () => {
  const { invoices } = parseInvoices(INVOICES, "2026-11-08");
  const { costs } = parseCosts(COSTS, "2026-11-08");
  const { result, note } = books(invoices, costs, "2026-11-08", "2026-11-09 09:30");
  assert.equal(result.message, "Nov: RM 5,000 paid · RM 3,500 invoiced · RM 5,500 outstanding · costs RM 60 + $49/mo");
  assert.match(note, /\| Paid \| RM 5,000 \| RM 1,000 \|/);
  assert.match(note, /\| Paid minus a month of costs \| RM 4,940 \+ −\$49 \| RM 940 \+ −\$49 \|/);
});

test("the KPI note gets one row per week, replaced if the job runs twice that day", () => {
  const w = weekTotals([{ day: "a", home_view: 10, preview_started: 4, preview_completed: 3, report_viewed: 2, apply_submitted: 1 }, { day: "b", home_view: 5 }]);
  assert.deepEqual(w, { home_view: 15, preview_started: 4, preview_completed: 3, report_viewed: 2, apply_submitted: 1 });
  const one = upsertRow("", "| 2026-11-09 | 15 | 4 | 3 | 2 | 1 | RM 5,000 |", "2026-11-09");
  assert.match(one, /Payroll: see Finance\.md/);
  const again = upsertRow(one, "| 2026-11-09 | 16 | 4 | 3 | 2 | 1 | RM 5,000 |", "2026-11-09");
  assert.equal(again.split("\n").filter((l) => l.startsWith("| 2026-11-09")).length, 1);
  const next = upsertRow(again, "| 2026-11-16 | 20 | 5 | 4 | 3 | 2 | RM 7,000 |", "2026-11-16");
  assert.deepEqual(next.split("\n").filter((l) => /^\| 2026/.test(l)).map((l) => l.slice(2, 12)), ["2026-11-09", "2026-11-16"]);
});

// ---------- payroll ----------

const PAYROLL = `# Payroll
- [ ] Aina (editor) · RM 2,500 · for Nov 2026 · due 2026-11-10
- [ ] Faiz (shoot, freelance) · RM 800 · due 2026-11-05
- [ ] Mei (captions) · RM 400 · due 2026-11-30
- [x] Faiz (shoot, freelance) · RM 600 · due 2026-11-02 · paid 2026-11-01
- [x] Aina (editor) · RM 2,500 · for Oct 2026 · paid 2026-10-31
`;

test("payroll check: unpaid totals, due-soon and late payouts go to Needs you, never a name", () => {
  const { invoices, unreadable } = parseInvoices(PAYROLL, "2026-11-08");
  const r = payrollCheck(invoices, unreadable, "2026-11-08");
  assert.equal(r.message, "3 payouts unpaid · RM 3,700 · 1 due within 3 days · 1 late · paid this month RM 600");
  assert.equal(r.attention, "1 payout late (RM 800); 1 payout due within 3 days (RM 2,500)");
  for (const name of ["Aina", "Faiz", "Mei", "editor"]) assert.ok(!JSON.stringify(r).includes(name), name);
  assert.equal(payrollCheck([], 0, "2026-11-08").attention, undefined);
  assert.deepEqual(parseInvoices(withoutComments(PAYROLL_TEMPLATE), "2026-11-08"), { invoices: [], unreadable: 0 });
});

test("the books summary nets out payroll when there is any, and stays as before when there is none", () => {
  const { invoices } = parseInvoices(INVOICES, "2026-11-08");
  const { costs } = parseCosts(COSTS, "2026-11-08");
  const { invoices: payroll } = parseInvoices(PAYROLL, "2026-11-08");
  const { result, note } = books(invoices, costs, "2026-11-08", "x", payroll);
  assert.match(result.message, / · payroll RM 600$/);
  assert.match(note, /\| Payroll paid \| RM 600 \| RM 2,500 \|/);
  assert.match(note, /\| Paid minus costs and payroll \| RM 4,340 \+ −\$49 \| −\$49 \+ −RM 1,560 \|/);
  assert.doesNotMatch(books(invoices, costs, "2026-11-08", "x").note, /Payroll/);
});

// ---------- DM sending ----------

const C = (id: string, hoursAgo: number, over: Partial<Comment> = {}): Comment =>
  ({ id, user: `fan${id}`, text: "AUDIT", at: new Date(NOW - hoursAgo * 3600_000).toISOString(), post: "https://instagram.com/p/x", source: "api", ...over });

test("nothing is sent unless sending is on", () => {
  assert.deepEqual(planSends([C("1", 1)], { sending: false, sent: new Set(), owner: "alanazizreview", now: NOW }), { send: [], tooOld: [] });
});

test("only fresh API comments under 7 days old, never twice, never your own, at most the cap", () => {
  const fresh = [
    C("1", 1), C("2", 2, { source: "apify" }), C("3", 3), C("4", 200), C("5", 4, { user: "AlanAzizReview" }), C("6", 5), C("7", 6),
  ];
  const plan = planSends(fresh, { sending: true, sent: new Set(["3"]), owner: "alanazizreview", now: NOW, cap: 2 });
  assert.deepEqual(plan.send.map((c) => c.id), ["1", "6"]);
  assert.deepEqual(plan.tooOld.map((c) => c.id), ["4"]);
});

test("the message comes from the note, outside the instructions, with the handle filled in", () => {
  assert.equal(messageFrom(MESSAGE_TEMPLATE), null, "the template alone sends nothing");
  const msg = messageFrom(MESSAGE_TEMPLATE + "\nHi {username}! Here's your audit: https://ruangkotak.com\n");
  assert.equal(msg, "Hi {username}! Here's your audit: https://ruangkotak.com");
  assert.equal(fill(msg!, { user: "kopikita" }), "Hi @kopikita! Here's your audit: https://ruangkotak.com");
});

test("a sent DM ticks exactly its own line", () => {
  const a = queueLine({ id: "111", user: "a", text: "AUDIT", at: "2026-11-08T01:00:00.000Z", post: "p" });
  const b = queueLine({ id: "222", user: "b", text: "AUDIT", at: "2026-11-08T01:00:00.000Z", post: "p" });
  const out = tickLine([a, b].join("\n"), "111", "DM sent 2026-11-08 09:05");
  assert.match(out.split("\n")[0], /^- \[x\] .* · DM sent 2026-11-08 09:05 <!-- rk:id=111 /);
  assert.equal(out.split("\n")[1], b);
  assert.deepEqual(readQueue(out), { waiting: 1, oldestAt: "2026-11-08T01:00:00.000Z" });
  assert.equal(tickLine(out, "999", "x"), out);
});

test("final review: open lines are named for the client; a tick after being open is a delivery, a deletion is not", () => {
  const t0 = "2026-11-08T01:00:00.000Z";
  const marked = markNewLines("# Final review\n- [ ] Reel 3 v2\n- [ ] Carousel for launch\n- [ ] Cancelled idea\n", t0).text;
  const first = finalReview(marked, { open: {}, delivered: [] }, new Date(t0));
  assert.deepEqual(first.items.map((i) => i.label), ["Reel 3 v2", "Carousel for launch", "Cancelled idea"]);
  assert.deepEqual(first.delivered, []);
  const next = marked.replace("- [ ] Reel 3 v2", "- [x] Reel 3 v2").split("\n").filter((l) => !l.includes("Cancelled")).join("\n");
  const second = finalReview(next, first, new Date("2026-11-09T01:00:00.000Z"));
  assert.deepEqual(second.items.map((i) => i.label), ["Carousel for launch"]);
  assert.deepEqual(second.delivered.map((d) => [d.label, d.at]), [["Reel 3 v2", "2026-11-09T01:00:00.000Z"]]);
  assert.equal(finalReview(next, second, new Date("2026-11-10T01:00:00.000Z")).delivered.length, 1, "not delivered twice");
  assert.equal(labelOf("- [ ] 2026-11-08 09:00 · @fan · \"AUDIT\" <!-- rk:id=1 at=x -->"), '@fan · "AUDIT"');
});

// ---------- agents ----------

test("only open asks routed to a desk with an agent are worked, once, with at most two tries", () => {
  const text = route("# Asks\n- [ ] write 5 hooks for reel 14 #scriptwriter\n- [ ] cut reel 14\n- [ ] call the venue\n- [x] old ask #designer\n", DESKS, "2026-11-08T01:00:00.000Z").text;
  const agentOf = new Map([["scriptwriter", "creative-lead"], ["designer", "creative-lead"]]);
  const asks = asksToWork(text, agentOf, { done: {}, failed: {} });
  assert.deepEqual(asks.map((a) => [a.desk, a.text]), [["scriptwriter", "write 5 hooks for reel 14 #scriptwriter"]], "Editor has no agent; the unrouted and ticked ones are skipped");
  assert.deepEqual(asksToWork(text, agentOf, { done: { [asks[0].id]: { at: "x", file: "y" } }, failed: {} }), []);
  assert.equal(asksToWork(text, agentOf, { done: {}, failed: { [asks[0].id]: 1 } }).length, 1, "one failure: retried");
  assert.equal(asksToWork(text, agentOf, { done: {}, failed: { [asks[0].id]: 2 } }).length, 0, "two failures: left for you");
});

test("agents run read-only, with their own instructions, and are told not to invent or act", () => {
  assert.equal(agentInstructions("---\nname: creative-lead\ntools: Read, Write\n---\n\nYou are the Creative lead."), "You are the Creative lead.");
  const args = claudeArgs("P", "I");
  assert.deepEqual(args.slice(0, 4), ["-p", "P", "--output-format", "json"]);
  assert.equal(args[args.indexOf("--allowedTools") + 1], "Read,Grep,Glob");
  for (const t of ["Bash", "Edit", "Write", "WebFetch"]) assert.ok(args[args.indexOf("--disallowedTools") + 1].split(",").includes(t), t);
  assert.deepEqual(TOOLS, ["Read", "Grep", "Glob"]);
  assert.ok(BLOCKED.includes("Bash"));
  const prompt = promptFor({ id: "1", desk: "scriptwriter", text: "write 5 hooks" }, "Scriptwriter", "creative-lead");
  assert.match(prompt, /\[TO CONFIRM\]/);
  assert.match(prompt, /Never say you sent, posted, scheduled or changed anything/);
});

test("readBoard counts posts with a Status line and ignores notes beside them", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "board-"));
  mkdirSync(join(dir, "2026-11-13"));
  writeFileSync(join(dir, "2026-11-13", "post.md"), "# Post\n**Status:** DRAFT\n");
  writeFileSync(join(dir, "2026-11-13", "shots.md"), "# Shot list, no status\n");
  assert.deepEqual(readBoard(dir).map((p) => p.file), ["2026-11-13/post.md"]);
});

test("ig-comment-dm drops Apify error items for posts with no comments", () => {
  assert.deepEqual(withoutErrorItems([{ error: "no_items" }]), []);
  assert.equal(withoutErrorItems([{ error: "no_items" }, {}]).length, 1);
});

test("final review lines can carry a due date and a posting date", () => {
  assert.deepEqual(datesOf("- [ ] Reel 3 v2 · due 2026-11-20 · post 2026-11-25 <!-- rk:id=a at=2026-11-07T01:00:00Z -->"), { due: "2026-11-20", post: "2026-11-25" });
  assert.deepEqual(datesOf("- [ ] Reel 4 · draft 2026-11-21"), { due: "2026-11-21" });
  assert.deepEqual(datesOf("- [ ] Reel 5 due soon"), {});
  const r = finalReview("- [ ] Reel 3 · due 2026-11-20 <!-- rk:id=a at=2026-11-07T01:00:00Z -->", { open: {}, delivered: [] }, new Date("2026-11-07T09:00:00Z"));
  assert.deepEqual(r.items, [{ label: "Reel 3 · due 2026-11-20", at: "2026-11-07T01:00:00Z", due: "2026-11-20" }]);
});
