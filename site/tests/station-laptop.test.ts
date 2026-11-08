import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnvFile } from "../scripts/station/client.mts";
import { verdict } from "../scripts/station/jobs/backup-freshness-guard.mts";
import { findSecrets } from "../scripts/station/jobs/credential-registry.mts";
import { describe } from "../scripts/station/jobs/sync-watchdog.mts";
import { isConflict } from "../scripts/station/jobs/vault-conflict-scan.mts";
import { compact, type ReelSnapshot } from "../scripts/station/apify.mts";
import { keywordsOf, matches, queueLine, readQueue } from "../scripts/station/jobs/ig-comment-dm.mts";
import { velocity } from "../scripts/station/jobs/ig-velocity.mts";
import { briefLine } from "../scripts/station/jobs/brief-sweep.mts";
import { review, statusOf, type Post } from "../scripts/station/jobs/board-completeness.mts";
import { deskFor, route, type DeskRef } from "../scripts/station/jobs/route-asks.mts";
import { markNewLines, markerOf } from "../scripts/station/queue.mts";
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
