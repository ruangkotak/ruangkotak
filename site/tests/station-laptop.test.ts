import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnvFile } from "../scripts/station/client.mts";
import { verdict } from "../scripts/station/jobs/backup-freshness-guard.mts";
import { findSecrets } from "../scripts/station/jobs/credential-registry.mts";
import { describe } from "../scripts/station/jobs/sync-watchdog.mts";
import { isConflict } from "../scripts/station/jobs/vault-conflict-scan.mts";

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
