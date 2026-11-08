import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applyBeat, buildSnapshot, isDue, checkRegistry, clientKeyName, cookieFor, cookieScope, eventFor, jobView, keyScope, nextCron,
  parseBeat, parseSchedule, resolveView,
  type Beat, type JobBeat, type Registry, type Run, type SnapshotInput, type View,
} from "../lib/station.ts";

const registry = JSON.parse(readFileSync(new URL("../data/station/registry.json", import.meta.url), "utf8")) as Registry;
const NOW = new Date("2026-11-07T09:00:00Z"); // 17:00 in Malaysia
const env = { STATION_KEY: "owner-secret-123", [clientKeyName("client-demo")]: "client-secret-456" };
const job = (id: string) => registry.jobs.find((j) => j.id === id)!;
const cronOf = (text: string) => {
  const s = parseSchedule(text);
  assert.ok(s && s.kind === "cron", text);
  return s.cron;
};
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

/** Feeds a sequence of beats through applyBeat, one minute apart, ending at `end`. */
function runsFrom(beats: Omit<JobBeat, "kind" | "jobId">[], end = NOW): Run[] {
  let runs: Run[] = [];
  beats.forEach((b, i) => (runs = applyBeat(runs, { kind: "job", jobId: "x", ...b }, new Date(end.getTime() - (beats.length - 1 - i) * 60_000))));
  return runs;
}

function snapshot(view: View, over: Partial<SnapshotInput> = {}) {
  return buildSnapshot({ registry, view, runs: {}, events: [], gates: {}, probes: [], funnel: null, now: NOW, ...over });
}

// ---------- registry ----------

test("the shipped registry is consistent", () => {
  assert.deepEqual(checkRegistry(registry), []);
});

test("the registry check catches a job on a missing desk", () => {
  const broken = { ...registry, jobs: [...registry.jobs, { id: "ghost", desk: "nobody", schedule: "every 5m", account: "internal" }] };
  assert.match(checkRegistry(broken).join("\n"), /ghost points at unknown desk/);
});

// ---------- schedules ----------

test("cron runs in Malaysia time", () => {
  // 17:00 MYT now, so the next 09:00 MYT is tomorrow 01:00 UTC.
  assert.equal(nextCron(cronOf("0 9 * * *"), NOW)?.toISOString(), "2026-11-08T01:00:00.000Z");
});

test("cron steps, lists, ranges and weekdays", () => {
  assert.equal(nextCron(cronOf("0 */6 * * *"), NOW)?.toISOString(), "2026-11-07T10:00:00.000Z"); // 18:00 MYT
  // 7 Nov 2026 is a Saturday: the next weekday 18:00 MYT is Monday 9 Nov.
  assert.equal(nextCron(cronOf("0 18 * * 1-5"), NOW)?.toISOString(), "2026-11-09T10:00:00.000Z");
  assert.equal(nextCron(cronOf("0 8,20 * * *"), NOW)?.toISOString(), "2026-11-07T12:00:00.000Z"); // 20:00 MYT
});

test("bad schedules are refused", () => {
  for (const s of ["", "every", "every 0m", "61 * * * *", "* * *", "*/0 * * * *", "every 5d"]) assert.equal(parseSchedule(s), null, s);
});

// ---------- runs and states ----------

test("a start without a finish is running", () => {
  const v = jobView(job("station-map-obs"), registry, runsFrom([{ state: "start" }], minutes(-2)), NOW);
  assert.equal(v.state, "running");
  assert.ok(v.startedAt);
});

test("a finish closes the open run instead of adding a new one", () => {
  const runs = runsFrom([{ state: "start" }, { state: "ok" }]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].ok, true);
  assert.ok(runs[0].startAt && runs[0].endAt);
});

test("three failures in a row is stuck, with the exit codes in the reason", () => {
  const runs = runsFrom([{ state: "ok" }, { state: "fail", exitCode: 1 }, { state: "fail", exitCode: 2 }, { state: "fail", exitCode: 1 }]);
  const v = jobView(job("credential-registry"), registry, runs, NOW);
  assert.equal(v.state, "stuck");
  assert.equal(v.reason, "last 3 runs exited 1, 2, 1");
  const long = runsFrom(Array.from({ length: 5 }, () => ({ state: "fail" as const, exitCode: 4 })));
  assert.equal(jobView(job("credential-registry"), registry, long, NOW).reason, "5 failed runs in a row, latest exits 4, 4, 4");
});

test("two failures is failing, not stuck; a success clears it", () => {
  const two = runsFrom([{ state: "fail" }, { state: "fail" }]);
  assert.equal(jobView(job("credential-registry"), registry, two, NOW).state, "failing");
  const healed = runsFrom([{ state: "fail" }, { state: "fail" }, { state: "fail" }, { state: "ok" }]);
  assert.notEqual(jobView(job("credential-registry"), registry, healed, NOW).state, "stuck");
});

test("a run open for over an hour is stuck (hung)", () => {
  const v = jobView(job("station-map-obs"), registry, runsFrom([{ state: "start" }], minutes(-90)), NOW);
  assert.equal(v.state, "stuck");
  assert.match(v.reason ?? "", /never finished/);
});

test("next run follows the last start; a missed slot reads as due", () => {
  // every 5m, last started 26 minutes ago and finished fine: it missed its slot.
  const late = jobView(job("station-map-obs"), registry, runsFrom([{ state: "start" }, { state: "ok" }], minutes(-25)), NOW);
  assert.equal(late.state, "due");
  assert.equal(late.nextAt, minutes(-21).toISOString());
  const fresh = jobView(job("station-map-obs"), registry, runsFrom([{ state: "start" }, { state: "ok" }], minutes(-2)), NOW);
  assert.equal(fresh.state, "scheduled");
});

test("an interval job that never reported has no invented next time", () => {
  const v = jobView(job("ig-comment-dm"), registry, [], NOW);
  assert.equal(v.state, "never");
  assert.equal(v.nextAt, null);
});

test("only the last 10 runs are kept", () => {
  const runs = runsFrom(Array.from({ length: 14 }, () => ({ state: "ok" as const })));
  assert.equal(runs.length, 10);
});

// ---------- beats ----------

test("beats for unknown jobs, gates or bad fields are rejected", () => {
  assert.deepEqual(parseBeat({ jobId: "nope", state: "ok" }, registry), { ok: false, error: "unknown jobId" });
  assert.equal(parseBeat({ jobId: "sync-watchdog", state: "maybe" }, registry).ok, false);
  assert.equal(parseBeat({ jobId: "sync-watchdog", state: "fail", exitCode: 1.5 }, registry).ok, false);
  assert.equal(parseBeat({ jobId: "sync-watchdog", state: "ok", source: "My Laptop!" }, registry).ok, false);
  assert.equal(parseBeat({ gate: "report", waiting: -1 }, registry).ok, false);
  assert.equal(parseBeat({ gate: "nope", waiting: 1 }, registry).ok, false);
  assert.equal(parseBeat({ gate: "report", waiting: 1, account: "someone-else" }, registry).ok, false);
  assert.equal(parseBeat(null, registry).ok, false);
});

test("a valid beat is accepted and its message is trimmed", () => {
  const r = parseBeat({ jobId: "sync-watchdog", state: "fail", exitCode: 3, message: `  ${"x".repeat(300)}  `, source: "laptop" }, registry);
  assert.ok(r.ok);
  assert.equal((r.beat as JobBeat).message?.length, 200);
  const g = parseBeat({ gate: "report", waiting: 2 }, registry);
  assert.ok(g.ok && g.beat.kind === "gate" && g.beat.account === "internal");
});

test("a failed beat leaves a readable log line", () => {
  const e = eventFor({ kind: "job", jobId: "credential-registry", state: "fail", exitCode: 1 } as Beat, registry, NOW);
  assert.equal(e.dept, "cto");
  assert.equal(e.level, "fail");
  assert.equal(e.message, "credential-registry failed (exit 1)");
});

// ---------- access ----------

test("only the right keys open anything", () => {
  assert.deepEqual(keyScope("owner-secret-123", null, env, registry), { kind: "owner" });
  assert.equal(keyScope("owner-secret-12", null, env, registry), null);
  assert.equal(keyScope("", null, env, registry), null);
  assert.equal(keyScope("owner-secret-123", null, {}, registry), null); // no env var, no station
  assert.deepEqual(keyScope("client-secret-456", "client-demo", env, registry), { kind: "client", account: "client-demo" });
  assert.equal(keyScope("client-secret-456", "alanazizreview", env, registry), null); // a client key opens only its own account
  assert.equal(keyScope("client-secret-456", null, env, registry), null);
  assert.equal(keyScope("owner-secret-123", "internal", { [clientKeyName("internal")]: "owner-secret-123" }, registry), null); // internal is never shareable
});

test("session cookies carry a signature, not the key, and die when the key rotates", () => {
  const owner = cookieFor({ kind: "owner" }, env)!;
  assert.ok(!owner.includes(env.STATION_KEY));
  assert.deepEqual(cookieScope(owner, env, registry), { kind: "owner" });
  assert.equal(cookieScope(owner, { ...env, STATION_KEY: "rotated" }, registry), null);
  const client = cookieFor({ kind: "client", account: "client-demo" }, env)!;
  assert.deepEqual(cookieScope(client, env, registry), { kind: "client", account: "client-demo" });
  assert.equal(cookieScope(client.replace("client-demo", "alanazizreview"), env, registry), null);
  assert.equal(cookieScope("owner.forged", env, registry), null);
});

test("a client scope can only resolve to its own client view", () => {
  const scope = { kind: "client" as const, account: "client-demo" };
  assert.deepEqual(resolveView(scope, {}, registry), { mode: "client", account: "client-demo" });
  assert.deepEqual(resolveView(scope, { view: "owner" }, registry), { mode: "client", account: "client-demo" });
  assert.equal(resolveView(scope, { account: "alanazizreview" }, registry), null);
  assert.equal(resolveView(null, {}, registry), null);
  assert.deepEqual(resolveView({ kind: "owner" }, { view: "client", account: "client-demo" }, registry), { mode: "client", account: "client-demo" });
  assert.equal(resolveView({ kind: "owner" }, { account: "made-up" }, registry), null);
});

// ---------- snapshot ----------

const failing3 = runsFrom([{ state: "fail" }, { state: "fail" }, { state: "fail" }]);

test("needs-you gathers stuck jobs, bad probes and overdue gates", () => {
  const s = snapshot({ mode: "owner", account: "all" }, {
    runs: { "credential-registry": failing3 },
    probes: [
      { id: "site", label: "ruangkotak.com", status: "degraded", detail: "front page slow: 2400 ms" },
      { id: "apify", label: "Apify", status: "no-probe", detail: "APIFY_TOKEN not set" },
    ],
    gates: { "report:internal": { waiting: 3, oldestAt: minutes(-30 * 60).toISOString(), at: NOW.toISOString() } },
  });
  assert.deepEqual(s.needsYou.map((n) => n.kind), ["job", "probe", "gate"]);
  assert.equal(s.needsYou[0].title, "Security Officer: credential-registry failing");
  assert.equal(s.top.stuck, 1);
  assert.equal(s.top.queue, 3);
  assert.equal(s.departments.find((d) => d.id === "cto")!.desks.find((k) => k.id === "security-officer")!.state, "stuck");
});

test("a gate nobody reports on says so instead of showing zero", () => {
  const s = snapshot({ mode: "owner", account: "all" });
  assert.equal(s.gates.find((g) => g.id === "report")!.waiting, null);
  assert.equal(s.funnel.status, "no-read-path");
});

test("the client view never leaks internal departments, other accounts, infra or sources", () => {
  const s = snapshot({ mode: "client", account: "client-demo" }, {
    runs: { "credential-registry": failing3, "client-demo-velocity": runsFrom([{ state: "start" }], minutes(-1)) },
    probes: [{ id: "site", label: "ruangkotak.com", status: "down", detail: "x" }],
    gates: { "report:internal": { waiting: 5, at: NOW.toISOString() }, "report:client-demo": { waiting: 1, at: NOW.toISOString() } },
    events: [
      { at: NOW.toISOString(), dept: "cmo", desk: "performance-analyst", account: "client-demo", level: "info", message: "running client-demo-velocity", source: "laptop" },
      { at: NOW.toISOString(), dept: "cmo", desk: "funnel-operator", account: "alanazizreview", level: "info", message: "running ig-comment-dm" },
      { at: NOW.toISOString(), dept: "cto", desk: "security-officer", account: "internal", level: "fail", message: "credential-registry failed" },
    ],
    funnel: [{ day: "2026-11-07", home_view: 9 }],
  });
  assert.deepEqual(s.departments.map((d) => d.id), ["cmo", "cdo"]);
  assert.equal(s.infra, null);
  assert.deepEqual(s.accounts.map((a) => a.id), ["client-demo"]);
  assert.ok(s.departments.flatMap((d) => d.jobs).every((j) => j.account === "client-demo"));
  assert.deepEqual(s.gates.map((g) => g.id), ["report", "final"]); // no invoice: that is the CFO's
  assert.equal(s.gates[0].waiting, 1);
  assert.deepEqual(s.log.map((e) => e.message), ["running client-demo-velocity"]);
  assert.equal(s.log[0].source, undefined);
  assert.equal(s.top.source, null);
  assert.deepEqual(s.needsYou, []);
  assert.equal(s.funnel.status, "no-read-path"); // the site funnel is RUANGKOTAK's, not the client's
  assert.equal(s.top.working, 1);
  assert.ok(s.departments.flatMap((d) => d.desks).every((k) => k.agent === undefined));
  const text = JSON.stringify(s);
  for (const leak of ["alanazizreview", "credential-registry", "laptop", "internal"]) assert.ok(!text.includes(leak), `client snapshot mentions ${leak}`);
});

test("the owner can filter to one account", () => {
  const s = snapshot({ mode: "owner", account: "alanazizreview" });
  assert.deepEqual([...new Set(s.departments.flatMap((d) => d.jobs).map((j) => j.account))], ["alanazizreview"]);
  assert.equal(s.departments.length, 6);
});

// ---------- laptop scheduler ----------

test("an interval job is due when it never ran or its gap has passed", () => {
  const every5 = parseSchedule("every 5m")!;
  assert.equal(isDue(every5, {}, NOW), true);
  assert.equal(isDue(every5, { lastStart: minutes(-4).toISOString() }, NOW), false);
  assert.equal(isDue(every5, { lastStart: minutes(-5).toISOString() }, NOW), true);
});

test("a cron job waits for its slot and catches up once after sleep", () => {
  const nightly = parseSchedule("0 3 * * *")!; // 03:00 MYT = 19:00 UTC the day before
  assert.equal(isDue(nightly, {}, NOW), false); // first sighting never fires straight away
  assert.equal(isDue(nightly, { lastCheck: minutes(-1).toISOString() }, NOW), false); // 17:00 MYT, slot is hours away
  // Laptop closed at 02:00 MYT, opened at 17:00 MYT: 03:00 passed while asleep, so it runs once now.
  assert.equal(isDue(nightly, { lastCheck: "2026-11-06T18:00:00Z" }, NOW), true);
});
