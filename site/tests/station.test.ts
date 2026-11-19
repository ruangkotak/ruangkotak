import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  alertable, alertText, planAlerts, REPEAT_MS, type NeedsYou, accountPanel, type ReelSnapshot, reelsDue, reelsMessage, reelTargets, siteProbe,
  answerCommand, ownerReport, clientCategory, CLIENT_CATEGORIES, commissionOf, cutOf, talentJob, talentMoney, applyBeat, buildSnapshot, clientTerms, clientUpdate, doneFile, parseDoneKey, isDue, clientJobs, hashKey, onboarding, publicRegistry, slugify, validateClient, withClients, type ClientRecord, checkRegistry, clientKeyName, cookieFor, cookieScope, eventFor, jobView, keyScope, nextCron,
  parseBeat, parseSchedule, resolveView,
  type Beat, type JobBeat, type Registry, type Run, type SnapshotInput, type View,
} from "../lib/station.ts";

const shipped = JSON.parse(readFileSync(new URL("../data/station/registry.json", import.meta.url), "utf8")) as Registry;
// The shipped file has no demo client any more. These tests still need a client written into the registry file, so add one.
const registry: Registry = {
  ...shipped,
  accounts: [...shipped.accounts, { id: "client-demo", label: "Client demo", kind: "client", funnel: null }],
  gates: shipped.gates.map((g) => (g.id === "final" ? { ...g, job: "client-demo-final-check" } : g)),
  jobs: [
    ...shipped.jobs,
    { id: "client-demo-velocity", desk: "performance-analyst", schedule: "30 */6 * * *", account: "client-demo", script: "ig-velocity" },
    { id: "client-demo-final-check", desk: "cdo-reviewer", schedule: "0 18 * * 1-5", account: "client-demo", script: "final-check" },
  ],
};
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
  assert.deepEqual(checkRegistry(shipped), []);
  assert.deepEqual(checkRegistry(registry), []);
  assert.ok(!shipped.accounts.some((a) => a.kind === "client"), "no demo client ships in the registry file");
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
  assert.equal(parseBeat({ gate: "review", waiting: -1 }, registry).ok, false);
  assert.equal(parseBeat({ gate: "nope", waiting: 1 }, registry).ok, false);
  assert.equal(parseBeat({ gate: "review", waiting: 1, account: "someone-else" }, registry).ok, false);
  assert.equal(parseBeat(null, registry).ok, false);
});

test("a valid beat is accepted and its message is trimmed", () => {
  const r = parseBeat({ jobId: "sync-watchdog", state: "fail", exitCode: 3, message: `  ${"x".repeat(300)}  `, source: "laptop" }, registry);
  assert.ok(r.ok);
  assert.equal((r.beat as JobBeat).message?.length, 200);
  const g = parseBeat({ gate: "review", waiting: 2 }, registry);
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
  // Same number of characters as the owner key, more bytes: a wrong key (null), never a thrown error.
  assert.equal(keyScope("owner-secret-12\u00e9", null, env, registry), null);
  assert.equal(cookieScope("owner.\u00e9".padEnd(6 + 64, "0"), env, registry), null);
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
    gates: { "review:internal": { waiting: 3, oldestAt: minutes(-50 * 60).toISOString(), at: NOW.toISOString() } },
  });
  assert.deepEqual(s.needsYou.map((n) => n.kind), ["job", "probe", "gate"]);
  assert.equal(s.needsYou[0].title, "Security Officer: credential-registry failing");
  assert.equal(s.top.stuck, 1);
  assert.equal(s.top.queue, 3);
  assert.equal(s.departments.find((d) => d.id === "cto")!.desks.find((k) => k.id === "security-officer")!.state, "stuck");
});

test("a gate nobody reports on says so instead of showing zero", () => {
  const s = snapshot({ mode: "owner", account: "all" });
  assert.equal(s.gates.find((g) => g.id === "review")!.waiting, null);
  assert.equal(s.funnel.status, "no-read-path");
});

test("the client view never leaks internal departments, other accounts, infra or sources", () => {
  const s = snapshot({ mode: "client", account: "client-demo" }, {
    runs: { "credential-registry": failing3, "client-demo-velocity": runsFrom([{ state: "start" }], minutes(-1)) },
    probes: [{ id: "site", label: "ruangkotak.com", status: "down", detail: "x" }],
    gates: { "review:internal": { waiting: 5, at: NOW.toISOString() }, "review:client-demo": { waiting: 1, at: NOW.toISOString() } },
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
  assert.deepEqual(s.gates.map((g) => g.id), ["review", "final", "dm"]); // no invoice: that is the CFO's
  assert.equal(s.gates[0].waiting, 1);
  assert.deepEqual(s.log.map((e) => e.message), ["running client-demo-velocity"]);
  assert.equal(s.log[0].source, undefined);
  assert.equal(s.top.source, null);
  assert.deepEqual(s.needsYou, []);
  assert.equal(s.funnel.status, "no-read-path"); // the site funnel is RUANGKOTAK's, not the client's
  assert.equal(s.top.working, 1);
  assert.ok(s.departments.flatMap((d) => d.desks).every((k) => k.agent === undefined));
  const text = JSON.stringify(s);
  for (const leak of ["alanazizreview", "credential-registry", "laptop", "internal", "instagram"]) assert.ok(!text.includes(leak), `client snapshot mentions ${leak}`);
});

test("the owner can filter to one account", () => {
  const s = snapshot({ mode: "owner", account: "alanazizreview" });
  assert.deepEqual([...new Set(s.departments.flatMap((d) => d.jobs).map((j) => j.account))], ["alanazizreview"]);
  assert.equal(s.departments.length, 7);
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

test("a finished job carries its last message for the card", () => {
  const v = jobView(job("ig-velocity-6h"), registry, applyBeat([], { kind: "job", jobId: "ig-velocity-6h", state: "ok", message: "newest 5h old: 1.2k plays" }, NOW), NOW);
  assert.equal(v.lastMessage, "newest 5h old: 1.2k plays");
});

test("the registry check catches a bad instagram handle", () => {
  const broken = { ...registry, accounts: registry.accounts.map((a) => (a.id === "alanazizreview" ? { ...a, instagram: "@Alan" } : a)) };
  assert.match(checkRegistry(broken).join("\n"), /invalid instagram handle/);
});

// ---------- attention ----------

test("a successful run can raise attention without failing", () => {
  const r = parseBeat({ jobId: "reminder-check", state: "ok", message: "5 active · 2 overdue", attention: "  2 overdue   tasks " }, registry);
  assert.ok(r.ok && r.beat.kind === "job");
  const runs = applyBeat([], r.beat as JobBeat, NOW);
  const v = jobView(job("reminder-check"), registry, runs, NOW);
  assert.equal(v.state === "failing" || v.state === "stuck", false);
  assert.equal(v.attention, "2 overdue tasks");
  const s = snapshot({ mode: "owner", account: "all" }, { runs: { "reminder-check": runs } });
  assert.deepEqual(s.needsYou.map((n) => n.title), ["Digest Editor: 2 overdue tasks"]);
});

test("attention clears on the next run without it, and never rides a start beat", () => {
  const first = applyBeat([], { kind: "job", jobId: "reminder-check", state: "ok", attention: "1 overdue task" }, minutes(-60));
  const next = applyBeat(first, { kind: "job", jobId: "reminder-check", state: "ok" }, NOW);
  assert.equal(jobView(job("reminder-check"), registry, next, NOW).attention, undefined);
  const start = parseBeat({ jobId: "reminder-check", state: "start", attention: "x" }, registry);
  assert.ok(start.ok && start.beat.kind === "job" && start.beat.attention === undefined);
});

test("the brief gate belongs to the COO, so clients never see it", () => {
  const owner = snapshot({ mode: "owner", account: "all" }, { gates: { "brief:internal": { waiting: 2, at: NOW.toISOString() } } });
  assert.equal(owner.gates.find((g) => g.id === "brief")?.waiting, 2);
  const client = snapshot({ mode: "client", account: "client-demo" });
  assert.ok(!client.gates.some((g) => g.id === "brief"));
});

// ---------- clients added from Station ----------

const KEY = "client-key-for-tests-0001";
const kopi: ClientRecord = { id: "kopi-kita", label: "Kopi Kita", instagram: "kopikita", createdAt: NOW.toISOString(), keyHash: hashKey(KEY), status: "active" };

test("the Add client form: names become short names, bad input is refused in plain words", () => {
  assert.equal(slugify("Kopi Kita & Co."), "kopi-kita-and-co");
  assert.equal(slugify("Café Ñoño"), "cafe-nono");
  const ok = validateClient({ label: "  Kopi   Kita ", instagram: "https://www.instagram.com/KopiKita/" }, new Set());
  assert.deepEqual(ok, { ok: true, value: { id: "kopi-kita", label: "Kopi Kita", instagram: "kopikita" } });
  assert.match((validateClient({ label: "K" }, new Set()) as { error: string }).error, /name/);
  assert.match((validateClient({ label: "Client Demo" }, new Set(["client-demo"])) as { error: string }).error, /already used/);
  assert.match((validateClient({ label: "All", slug: "all" }, new Set()) as { error: string }).error, /short name/);
  assert.match((validateClient({ label: "Kopi", instagram: "not a handle!" }, new Set()) as { error: string }).error, /Instagram/);
});

test("a client gets velocity (only with a handle) and final-check jobs, spread over the hour", () => {
  assert.deepEqual(clientJobs(kopi).map((j) => [j.id, j.script]), [["kopi-kita-velocity", "ig-velocity"], ["kopi-kita-final-check", "final-check"]]);
  assert.match(clientJobs(kopi)[0].schedule, /^\d{1,2} \*\/6 \* \* \*$/);
  assert.deepEqual(clientJobs({ id: "no-ig" }).map((j) => j.id), ["no-ig-final-check"]);
});

test("active clients join the registry; paused ones and ones shadowing the file do not", () => {
  const r = withClients(registry, [kopi, { ...kopi, id: "sleepy", status: "paused" }, { ...kopi, id: "client-demo", label: "Impostor" }]);
  assert.deepEqual(checkRegistry(r), []);
  assert.ok(r.accounts.some((a) => a.id === "kopi-kita" && a.kind === "client"));
  assert.ok(!r.accounts.some((a) => a.id === "sleepy"));
  assert.equal(r.accounts.find((a) => a.id === "client-demo")!.label, "Client demo");
  assert.ok(r.jobs.some((j) => j.id === "kopi-kita-final-check"));
});

test("a stored client's key opens only their account, through the same cookie flow, and rotating it ends sessions", () => {
  const r = withClients(registry, [kopi]);
  assert.deepEqual(keyScope(KEY, "kopi-kita", env, r), { kind: "client", account: "kopi-kita" });
  assert.equal(keyScope(KEY, "client-demo", env, r), null);
  assert.equal(keyScope("wrong", "kopi-kita", env, r), null);
  const cookie = cookieFor({ kind: "client", account: "kopi-kita" }, env, r)!;
  assert.ok(cookie && !cookie.includes(KEY));
  assert.deepEqual(cookieScope(cookie, env, r), { kind: "client", account: "kopi-kita" });
  const rotated = withClients(registry, [{ ...kopi, keyHash: hashKey("a-new-key-0002") }]);
  assert.equal(cookieScope(cookie, env, rotated), null);
  assert.equal(cookieScope(cookie, env, withClients(registry, [{ ...kopi, status: "paused" }])), null);
  assert.equal(keyScope(KEY, "kopi-kita", env, withClients(registry, [{ ...kopi, status: "paused" }])), null);
});

test("key hashes never leave the server: not in the laptop's registry, not in any snapshot", () => {
  const r = withClients(registry, [kopi]);
  assert.ok(!JSON.stringify(publicRegistry(r)).includes(kopi.keyHash));
  const owner = buildSnapshot({ registry: r, view: { mode: "owner", account: "all" }, runs: {}, events: [], gates: {}, probes: [], funnel: null, now: NOW });
  const client = buildSnapshot({ registry: r, view: { mode: "client", account: "kopi-kita" }, runs: {}, events: [], gates: {}, probes: [], funnel: null, now: NOW });
  for (const s of [owner, client]) assert.ok(!JSON.stringify(s).includes(kopi.keyHash));
  assert.deepEqual(client.departments.flatMap((d) => d.jobs).map((j) => j.id).sort(), ["kopi-kita-final-check", "kopi-kita-velocity"]);
});

test("onboarding steps follow what Station has seen", () => {
  const fresh = onboarding(kopi, {}, {});
  assert.deepEqual(fresh.map((s) => [s.id, s.done]), [["link", true], ["opened", false], ["velocity", false], ["final", false], ["price", false]]);
  const runs = {
    "kopi-kita-velocity": applyBeat([], { kind: "job", jobId: "kopi-kita-velocity", state: "ok" }, NOW),
    "kopi-kita-final-check": applyBeat([], { kind: "job", jobId: "kopi-kita-final-check", state: "ok" }, NOW),
  };
  const later = onboarding({ ...kopi, openedAt: NOW.toISOString(), price: 500, perMonth: 4 }, runs, { "final:kopi-kita": { waiting: 2, at: NOW.toISOString() } });
  assert.ok(later.every((s) => s.done));
  assert.match(later[3].note!, /2 waiting · add deliverables to final-queue-kopi-kita\.md/);
  assert.match(onboarding({ ...kopi, instagram: undefined }, {}, {})[2].note!, /Instagram handle/);
});

// ---------- Telegram alerts ----------

const N = (key: string, title: string, kind: NeedsYou["kind"] = "job"): NeedsYou => ({ key, kind, title, detail: "" });

test("needs-you items carry keys that name the thing, not the wording", () => {
  const s = snapshot({ mode: "owner", account: "all" }, {
    runs: { "credential-registry": failing3, "reminder-check": applyBeat([], { kind: "job", jobId: "reminder-check", state: "ok", attention: "2 overdue tasks" }, NOW) },
    probes: [{ id: "site", label: "ruangkotak.com", status: "down", detail: "x" }],
  });
  assert.deepEqual(s.needsYou.map((n) => n.key), ["job:credential-registry", "attention:reminder-check", "probe:site:down"]);
});

test("a new item is announced once; a reworded one again only after 6 hours; a cleared one once as resolved", () => {
  const first = planAlerts([N("a", "1 invoice late")], {}, NOW);
  assert.deepEqual(first.raised.map((n) => n.key), ["a"]);
  const same = planAlerts([N("a", "1 invoice late")], first.next, minutes(5));
  assert.equal(alertText(same, "L"), null, "nothing new, nothing sent");
  const soon = planAlerts([N("a", "2 invoices late")], first.next, minutes(60));
  assert.equal(soon.updated.length, 0, "reworded within 6h: quiet");
  const later = planAlerts([N("a", "2 invoices late")], first.next, new Date(NOW.getTime() + REPEAT_MS));
  assert.deepEqual(later.updated.map((n) => n.title), ["2 invoices late"]);
  const cleared = planAlerts([], later.next, minutes(500));
  assert.deepEqual(cleared.resolved, [{ key: "a", title: "2 invoices late" }]);
  assert.deepEqual(cleared.next, {});
});

test("the message lists what is new, then what cleared, then the link", () => {
  const prev = { b: { title: "Billing Clerk: 1 invoice past due", at: NOW.toISOString() } };
  const plan = planAlerts([{ ...N("a", "Security Officer: credential-registry failing"), detail: "last 3 runs exited 1, 1, 1" }], prev, NOW);
  assert.equal(alertText(plan, "https://ruangkotak.com/station#health"),
    "KNOX needs you (1)\n• Security Officer: credential-registry failing (last 3 runs exited 1, 1, 1)\n\nResolved\n✓ Billing Clerk: 1 invoice past due\n\nhttps://ruangkotak.com/station#health");
  assert.match(alertText(planAlerts([], prev, NOW), "L")!, /^KNOX: cleared\n✓ Billing Clerk/);
});

test("a slow site and a laptop closed overnight are not alerts; a laptop quiet for 12 hours is", () => {
  const items = [N("probe:site:degraded", "ruangkotak.com degraded", "probe"), N("probe:laptop:down", "Laptop down", "probe"), N("job:x", "x failing")];
  assert.deepEqual(alertable(items, minutes(-60).toISOString(), NOW).map((n) => n.key), ["job:x"]);
  const quiet = alertable(items, minutes(-13 * 60).toISOString(), NOW);
  assert.deepEqual(quiet.map((n) => n.key), ["job:x", "laptop:quiet"]);
  assert.equal(quiet[1].title, "Laptop quiet for 13h");
});

// ---------- account pages ----------

test("reel beats are validated: own accounts only, instagram links, at most 12", () => {
  const reel = { url: "https://www.instagram.com/reel/AAA/", at: "2026-11-07T01:00:00Z", views: 1200 };
  const ok = parseBeat({ reels: [reel], account: "alanazizreview" }, registry);
  assert.ok(ok.ok && ok.beat.kind === "reels" && ok.beat.reels[0].views === 1200);
  assert.equal(parseBeat({ reels: [reel], account: "internal" }, registry).ok, false);
  assert.equal(parseBeat({ reels: [{ ...reel, url: "https://evil.example/x" }], account: "alanazizreview" }, registry).ok, false);
  assert.equal(parseBeat({ reels: Array(13).fill(reel), account: "alanazizreview" }, registry).ok, false);
  assert.equal(parseBeat({ reels: [{ ...reel, views: -1 }], account: "alanazizreview" }, registry).ok, false);
});

test("gate beats can name their items, cleaned and capped", () => {
  const r = parseBeat({ gate: "final", account: "client-demo", waiting: 1, items: [{ label: " Reel 3   v2 <!-- x --> ", at: "2026-11-07T01:00:00Z" }], delivered: [] }, registry);
  assert.ok(r.ok && r.beat.kind === "gate");
  assert.deepEqual((r.beat as { items?: unknown }).items, [{ label: "Reel 3 v2 x", at: "2026-11-07T01:00:00.000Z" }]);
  assert.equal(parseBeat({ gate: "final", waiting: 1, items: [{ label: 3, at: "x" }] }, registry).ok, false);
});

const snapAt = (hAgo: number, reels: [string, number, number][]): ReelSnapshot =>
  ({ at: minutes(-hAgo * 60).toISOString(), reels: reels.map(([id, ageH, views]) => ({ url: `https://www.instagram.com/reel/${id}/`, at: minutes(-ageH * 60).toISOString(), views })) });

test("the account panel: plays per hour since the last check, plays gained this week, the trend, and the review lists", () => {
  const snaps = [
    snapAt(0, [["NEW", 20, 3000], ["A", 100, 9000], ["B", 400, 5200]]),
    snapAt(6, [["A", 94, 8400], ["B", 394, 5100]]),
    snapAt(7 * 24, [["B", 232, 4000]]), // a week ago only B existed
  ];
  const finalGate = { waiting: 2, at: NOW.toISOString(), items: [{ label: "Reel 3 v2", at: minutes(-120).toISOString() }], delivered: [{ label: "Carousel", at: minutes(-24 * 60).toISOString() }, { label: "Old thing", at: minutes(-40 * 24 * 60).toISOString() }] };
  const p = accountPanel("Kopi Kita", snaps, finalGate, NOW);
  assert.deepEqual(p.reels.map((r) => r.perHour), [null, 100, 17]);
  assert.equal(p.week.posted, 2, "NEW (20h) and A (100h) are both under 7 days old");
  assert.equal(p.week.playsGained, 3000 + 9000 + 1200); // NEW and A were posted after the base check: counted in full
  assert.equal(p.week.delivered, 1);
  assert.equal(p.week.inReview, 2);
  assert.deepEqual(p.trend.map((t) => t.median), [4000, 6750, 5200]);
  assert.deepEqual(p.review.delivered.map((d) => d.label), ["Carousel"], "older than 30 days drops off");
  const empty = accountPanel("New", [], undefined, NOW);
  assert.deepEqual(empty.week, { posted: 0, playsGained: null, delivered: 0, inReview: null });
});

test("a client's page shows only their reels and items; internal has no panel; all-accounts shows the owner's own", () => {
  const gates = {
    "final:client-demo": { waiting: 1, at: NOW.toISOString(), items: [{ label: "Demo reel", at: NOW.toISOString() }] },
    "final:alanazizreview": { waiting: 1, at: NOW.toISOString(), items: [{ label: "Alan secret project", at: NOW.toISOString() }] },
  };
  const client = snapshot({ mode: "client", account: "client-demo" }, { gates, reels: [snapAt(0, [["D", 5, 100]])] });
  assert.equal(client.account?.label, "Client demo");
  assert.ok(!JSON.stringify(client).includes("Alan secret project"));
  assert.equal(snapshot({ mode: "owner", account: "all" }, { gates }).account?.label, "@alanazizreview", "the owner sees their own creator account");
  assert.equal(snapshot({ mode: "owner", account: "internal" }, { gates }).account, undefined);
});

// ---------- site probe and server reel checks ----------

test("the site tile: a real outage on Vercel, NO PROBE when a laptop or sandbox simply can't reach it", () => {
  assert.equal(siteProbe({ status: 200, ms: 196 }, true).status, "ok");
  assert.equal(siteProbe({ status: 200, ms: 2400 }, true).status, "degraded");
  assert.equal(siteProbe({ status: 503, ms: 80 }, false).status, "down", "an answer that isn't 200 is down anywhere");
  assert.equal(siteProbe({ error: "unreachable" }, true).status, "down");
  const local = siteProbe({ error: "unreachable" }, false);
  assert.equal(local.status, "no-probe");
  assert.match(local.detail, /can't reach it from here/);
});

test("reels are re-checked when there is none, or the newest is 6 hours old", () => {
  assert.equal(reelsDue([], NOW), true);
  assert.equal(reelsDue([snapAt(2, [])], NOW), false);
  assert.equal(reelsDue([snapAt(6, [])], NOW), true);
});

test("the server's reel check reports like the laptop job", () => {
  const prev = snapAt(6, [["A", 26, 1000]]);
  const cur = { ...snapAt(0, [["A", 20, 1600], ["B", 300, 9000]]) };
  assert.equal(reelsMessage("alanazizreview", cur, prev), "@alanazizreview · 2 reels · newest 20h old: 1600 plays (+100/h)");
  assert.equal(reelsMessage("alanazizreview", { at: NOW.toISOString(), reels: [] }, undefined), "@alanazizreview · no public reels returned");
});

test("the owner's all-accounts view shows their own creator account's panel", () => {
  const s = snapshot({ mode: "owner", account: "all" }, { reels: [snapAt(0, [["A", 20, 1600]])] });
  assert.equal(s.account?.label, "@alanazizreview");
  assert.equal(s.account?.reels[0].views, 1600);
  assert.equal(snapshot({ mode: "client", account: "client-demo" }).account?.label, "Client demo");
});

test("reelTargets: a handle shown on two pages is scraped once, internal and handle-less accounts are skipped", () => {
  const t = reelTargets([
    { id: "internal", kind: "internal" },
    { id: "alanazizreview", kind: "personal", instagram: "alanazizreview" },
    { id: "alan-review", kind: "client", instagram: "alanazizreview" },
    { id: "acme", kind: "client", instagram: "acme" },
    { id: "no-ig", kind: "client" },
  ]);
  assert.deepEqual([...t], [["alanazizreview", ["alanazizreview", "alan-review"]], ["acme", ["acme"]]]);
});

// ---------- five stages, Needs me, dates and money ----------

test("the five stages and Needs me are built from gates and clients, owner only", () => {
  const priced: ClientRecord = { ...kopi, openedAt: NOW.toISOString(), price: 500, perMonth: 4 };
  const fresh: ClientRecord = { ...kopi, id: "new-co", label: "New Co" };
  const r = withClients(shipped, [priced, fresh]);
  const gates = {
    "drafts:internal": { waiting: 3, oldestAt: minutes(-60).toISOString(), at: NOW.toISOString() },
    "final:kopi-kita": {
      waiting: 2, at: NOW.toISOString(),
      items: [{ label: "Reel 2", at: minutes(-30).toISOString(), due: "2026-11-20" }, { label: "Reel 1", at: minutes(-30).toISOString(), due: "2026-11-06", post: "2026-11-10" }],
      delivered: [{ label: "Reel 0", at: minutes(-600).toISOString() }],
    },
    "final:gone-client": { waiting: 9, at: NOW.toISOString() }, // a removed client's old reading
    "invoice:internal": { waiting: 0, at: NOW.toISOString() },
  };
  const input = { registry: r, runs: {}, events: [], gates, probes: [], funnel: null, clients: [priced, fresh], now: NOW };
  const s = buildSnapshot({ ...input, view: { mode: "owner", account: "all" } });
  assert.deepEqual(s.stages!.map((x) => [x.id, x.waiting]), [["audience", null], ["onboard", 1], ["make", 5], ["post", null], ["paid", 0]]);
  assert.equal(s.gates.find((g) => g.id === "final")!.waiting, 2, "the removed client's reading is not counted");
  // Past its due date comes first, then the next due date, then the oldest wait.
  assert.deepEqual(s.needsMe!.map((n) => n.title), [
    "Final review: Reel 1", "Final review: Reel 2", "Agent drafts waiting for your approval: 3", "Set the price for New Co", "Send New Co their private link",
  ]);
  assert.deepEqual([s.needsMe![0].overdue, s.needsMe![0].due, s.needsMe![0].where], [true, "2026-11-06", "Station/final-queue-kopi-kita.md"]);
  assert.match(s.needsMe![0].detail, /posts 2026-11-10/);
  assert.equal(s.needsMe![1].overdue, false);
  assert.deepEqual(s.money, { monthly: 2000, priced: 1, clients: 2, invoices: undefined });
  assert.match(s.stages!.find((x) => x.id === "post")!.note!, /^1 passed final review/);
  assert.match(s.stages!.find((x) => x.id === "paid")!.note!, /RM2,000 a month agreed with 1 of 2 clients/);
  // The Final gate is reviewed by one job per client: its next review is the soonest of them.
  assert.ok(s.gates.find((g) => g.id === "final")!.nextReviewAt);
  // A client never gets the owner's queue or the money.
  const c = buildSnapshot({ ...input, view: { mode: "client", account: "kopi-kita" } });
  assert.deepEqual([c.stages, c.needsMe, c.money], [undefined, undefined, undefined]);
  assert.ok(!JSON.stringify(c).includes("500"));
});

test("a stuck job reaches Needs me as a system item", () => {
  const s = snapshot({ mode: "owner", account: "all" }, { runs: { "sync-watchdog": runsFrom([{ state: "start" }], minutes(-90)) } });
  assert.deepEqual(s.needsMe!.map((n) => [n.stage, n.overdue]), [["system", true]]);
});

test("gate items keep well-formed due and post dates and drop anything else", () => {
  const r = parseBeat({ gate: "final", account: "client-demo", waiting: 1, items: [{ label: "Reel 3", at: "2026-11-07T01:00:00Z", due: "2026-11-20", post: "next week" }] }, registry);
  assert.ok(r.ok && r.beat.kind === "gate");
  assert.deepEqual(r.beat.items, [{ label: "Reel 3", at: "2026-11-07T01:00:00.000Z", due: "2026-11-20" }]);
});

test("client terms: a price in RM and whole reels per month, blank clears", () => {
  assert.deepEqual(clientTerms({ price: "500", perMonth: "4" }), { ok: true, value: { price: 500, perMonth: 4 } });
  assert.deepEqual(clientTerms({ price: "", perMonth: null }), { ok: true, value: { price: undefined, perMonth: undefined } });
  assert.equal(clientTerms({ price: "abc" }).ok, false);
  assert.equal(clientTerms({ price: -1 }).ok, false);
  assert.equal(clientTerms({ price: 500, perMonth: 2.5 }).ok, false);
});

// ---------- Done presses on Needs me ----------

test("Done: only checklists and named final items can be cleared, and a press hides what was waiting then", () => {
  const r = withClients(shipped, [{ ...kopi, openedAt: NOW.toISOString(), price: 500, perMonth: 4 }]);
  const gates = {
    "drafts:internal": { waiting: 2, oldestAt: minutes(-60).toISOString(), at: NOW.toISOString() },
    "invoice:internal": { waiting: 1, oldestAt: minutes(-60).toISOString(), at: NOW.toISOString() },
    "final:kopi-kita": { waiting: 1, at: NOW.toISOString(), items: [{ label: "Reel 1", at: minutes(-30).toISOString() }] },
  };
  const build = (done = {}) => buildSnapshot({ registry: r, view: { mode: "owner", account: "all" }, runs: {}, events: [], gates, probes: [], funnel: null, clients: [], done, now: NOW }).needsMe!;
  assert.deepEqual(build().map((n) => [n.key, n.clear]), [["gate:drafts:internal", "all"], ["gate:invoice:internal", undefined], ["final:kopi-kita:Reel 1", "item"]]);
  // Pressed after the lines were waiting: gone from the queue. The count on the gate is the laptop's to update.
  const at = NOW.toISOString();
  assert.deepEqual(build({ "gate:drafts:internal": { at }, "final:kopi-kita:Reel 1": { at, applied: true } }).map((n) => n.key), ["gate:invoice:internal"]);
  // Pressed before these lines arrived: they show again.
  assert.equal(build({ "gate:drafts:internal": { at: minutes(-90).toISOString() } }).length, 3);
});

test("Done keys name a checklist file and nothing else", () => {
  assert.deepEqual(parseDoneKey("gate:drafts:internal"), { gate: "drafts", account: "internal" });
  assert.deepEqual(parseDoneKey("final:kopi-kita:Reel 3 v2 · due 2026-11-20"), { gate: "final", account: "kopi-kita", label: "Reel 3 v2 · due 2026-11-20" });
  for (const bad of ["gate:invoice:internal", "gate:review:internal", "price:kopi-kita", "link:kopi-kita", "job:sync-watchdog", "final:../x:y"]) assert.equal(parseDoneKey(bad), null, bad);
  const account = (id: string, instagram?: string) => ({ id, label: id, kind: "client" as const, funnel: null, instagram });
  assert.equal(doneFile("final", account("kopi-kita")), "final-queue-kopi-kita.md");
  assert.equal(doneFile("dm", account("alanazizreview", "alanazizreview")), "dm-queue-alanazizreview.md");
  assert.equal(doneFile("drafts", account("internal")), "drafts-queue.md");
  assert.equal(doneFile("review", account("internal")), undefined);
});

test("the update to send uses only what the client page already shows", () => {
  const panel = accountPanel("Kopi Kita", [{ at: NOW.toISOString(), reels: [{ url: "https://www.instagram.com/reel/A/", at: minutes(-60).toISOString(), views: 1200 }, { url: "https://www.instagram.com/reel/B/", at: minutes(-90).toISOString(), views: 300 }] }],
    { waiting: 1, at: NOW.toISOString(), items: [{ label: "Reel 3", at: NOW.toISOString() }], delivered: [{ label: "Reel 2", at: minutes(-120).toISOString() }] }, NOW);
  const text = clientUpdate(panel, NOW);
  assert.match(text, /^Kopi Kita · update for the 7 days to 7 Nov/);
  assert.match(text, /Reels posted: 2\nPlays gained across tracked reels: not enough checks yet\nPassed final review: 1\nWaiting in final review: 1\n  • Reel 3/);
  assert.match(text, /Delivered in the last 30 days:\n  • Reel 2 \(7 Nov\)/);
  assert.match(text, /Most played reel: 1,200 plays · https:\/\/www\.instagram\.com\/reel\/A\//);
  assert.ok(!/RM|price/i.test(text));
});

// ---------- carousel studio (pure parts) ----------

test("carousel: a script becomes a cover, body slides and an end page, eight at most", async () => {
  const { assignPhotos, captionFrom, slidesFrom, zip, MAX_SLIDES } = await import("../lib/carousel.ts");
  const slides = slidesFrom("HOOK: stop buying mics\nfirst point\nAVOID: weak hook\n\nsecond point\nCTA: comment SETUP", "@kopikita");
  assert.deepEqual(slides.map((s) => [s.kind, s.head]), [["cover", "Stop buying mics"], ["body", "First point"], ["body", "Second point"], ["end", "Comment SETUP"]]);
  assert.equal(slides.at(-1)!.body, "Follow @kopikita for more");
  assert.equal(slidesFrom(Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n"), "").length, MAX_SLIDES);
  assert.deepEqual(slidesFrom("", "").map((s) => s.kind), ["cover", "end"]);
  assert.equal(captionFrom(slides), "Stop buying mics\n\n→ First point\n→ Second point\n\nComment SETUP");
  // Photos fill the slides in order and never land on the end page.
  assert.deepEqual(assignPhotos(slides, 2).map((s) => s.img), [0, 1, null, null]);
  assert.deepEqual(assignPhotos(slides.map((s, i) => (i === 0 ? { ...s, img: 5 } : s)), 1).map((s) => s.img), [0, null, null, null]);
  // The zip starts with a local file header and ends with the end-of-central-directory record for one file.
  const z = zip([{ name: "a.png", data: new Uint8Array([1, 2, 3]) }]);
  assert.deepEqual([...z.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.equal(new DataView(z.buffer).getUint16(z.length - 22 + 10, true), 1);
  assert.equal(z.length, 30 + 5 + 3 + 46 + 5 + 22);
});

test("carousel: Auto changes the grid layout on every slide, a fixed choice never changes", async () => {
  const { AUTO_ORDER, BACKGROUNDS, layoutFor } = await import("../lib/carousel.ts");
  const seen = Array.from({ length: 8 }, (_, i) => layoutFor("auto", i));
  assert.ok(seen.every((l, i) => i === 0 || l !== seen[i - 1]), "neighbouring slides differ");
  assert.equal(new Set(seen.slice(0, AUTO_ORDER.length)).size, AUTO_ORDER.length, "each layout is used once per round");
  assert.equal(seen[AUTO_ORDER.length], seen[0], "then it starts again");
  assert.deepEqual(Array.from({ length: 4 }, (_, i) => layoutFor("dots", i)), ["dots", "dots", "dots", "dots"]);
  assert.deepEqual(BACKGROUNDS.map((b) => b[0]).filter((b) => b !== "auto").sort(), [...AUTO_ORDER].sort(), "Auto covers every layout");
});

// ---------- typing to KNOX from Telegram ----------

test("telegram: only the owner's private chat counts; words are commands, everything else is an ask", async () => {
  const { readUpdate, secretOk, telegramSecret } = await import("../lib/telegram.ts");
  const msg = (text: unknown, over: Record<string, unknown> = {}) => ({ message: { text, chat: { id: 42, type: "private" }, from: { is_bot: false }, ...over } });
  // Commands: with or without the slash, and with the bot name Telegram adds in groups.
  assert.deepEqual(readUpdate(msg("needs"), "42"), { kind: "command", text: "needs" });
  assert.deepEqual(readUpdate(msg("/Money@MyBot"), "42"), { kind: "command", text: "money" });
  assert.deepEqual(readUpdate(msg("/start"), "42"), { kind: "command", text: "help" });
  // Asks: plain text, and /ask with the command word stripped.
  assert.deepEqual(readUpdate(msg("write 3 hooks for the Acer reel"), "42"), { kind: "ask", text: "write 3 hooks for the Acer reel" });
  assert.deepEqual(readUpdate(msg("/ask needs a caption for the Acer reel"), "42"), { kind: "ask", text: "needs a caption for the Acer reel" });
  // Everyone and everything else is ignored.
  assert.equal(readUpdate(msg("needs", { chat: { id: 43, type: "private" } }), "42").kind, "ignore", "another chat");
  assert.equal(readUpdate(msg("needs", { chat: { id: 42, type: "group" } }), "42").kind, "ignore", "a group");
  assert.equal(readUpdate(msg("needs", { from: { is_bot: true } }), "42").kind, "ignore", "a bot");
  assert.equal(readUpdate(msg("   "), "42").kind, "ignore", "blank");
  assert.equal(readUpdate(msg(undefined), "42").kind, "ignore", "a sticker or photo has no text");
  assert.equal(readUpdate({ edited_message: { text: "needs" } }, "42").kind, "ignore", "an edit");
  assert.equal(readUpdate(msg("needs"), undefined).kind, "ignore", "no owner chat set");
  assert.equal(readUpdate(null, "42").kind, "ignore");
  // The secret comes from the owner key: right key passes, wrong key, no key and no header do not.
  const secret = telegramSecret("owner-key");
  assert.equal(secretOk(secret, "owner-key"), true);
  assert.equal(secretOk(secret, "other-key"), false);
  assert.equal(secretOk(secret, undefined), false);
  assert.equal(secretOk(null, "owner-key"), false);
  assert.equal(secretOk("x", "owner-key"), false);
  assert.match(secret, /^[0-9a-f]{64}$/, "allowed characters for a Telegram secret token");
  assert.notEqual(secret, "owner-key", "the key itself is never sent to Telegram");
});

// ---------- found by testing the live board ----------

test("a warning about posting joins the Post line, not the Review line beside it", () => {
  const gates = { "review:internal": { waiting: 2, oldestAt: minutes(-60).toISOString(), at: NOW.toISOString() }, "post:internal": { waiting: 1, oldestAt: minutes(-30).toISOString(), at: NOW.toISOString() } };
  const withWarning = (attention: string) => snapshot({ mode: "owner", account: "all" }, { gates, runs: { "board-completeness": runsFrom([{ state: "start" }, { state: "ok", attention }]) } }).needsMe!;
  const line = (items: ReturnType<typeof withWarning>, key: string) => items.find((n) => n.key === key)!;
  const post = withWarning("1 approved post past its posting date");
  assert.match(line(post, "gate:post:internal").detail, /past its posting date/);
  assert.equal(line(post, "gate:post:internal").overdue, true);
  assert.equal(line(post, "gate:review:internal").overdue, false);
  const both = withWarning("2 drafts publishing within a day are not approved; 3 approved posts past their posting date");
  assert.match(line(both, "gate:review:internal").detail, /2 drafts publishing/);
  assert.doesNotMatch(line(both, "gate:review:internal").detail, /posting date/);
  assert.match(line(both, "gate:post:internal").detail, /3 approved posts past their posting date/);
});

test("a job's warning about its own gate joins that gate's line, and system items say where to fix them", () => {
  const failing3 = runsFrom([{ state: "fail" }, { state: "fail" }, { state: "fail" }]);
  const s = snapshot({ mode: "owner", account: "all" }, {
    gates: { "review:internal": { waiting: 2, oldestAt: minutes(-60).toISOString(), at: NOW.toISOString() }, "post:internal": { waiting: 1, oldestAt: minutes(-30).toISOString(), at: NOW.toISOString() } },
    runs: { "board-completeness": runsFrom([{ state: "start" }, { state: "ok", attention: "2 drafts publishing within a day are not approved" }]), "ig-velocity-6h": failing3 },
    probes: [{ id: "apify", label: "Apify", status: "down", detail: "token refused (401)" }],
  });
  const review = s.needsMe!.find((n) => n.key === "gate:review:internal")!;
  assert.match(review.detail, /2 drafts publishing within a day are not approved/);
  assert.equal(review.overdue, true);
  assert.match(review.where!, /Status.*APPROVED/);
  assert.ok(!s.needsMe!.some((n) => n.key === "attention:board-completeness"), "not listed a second time");
  assert.match(s.needsMe!.find((n) => n.key.startsWith("probe:apify"))!.where!, /APIFY_TOKEN/);
  assert.equal(s.needsMe!.find((n) => n.key === "job:ig-velocity-6h")!.where, "Health tab");
  // Post is a real stage now: approved posts not yet marked published.
  assert.deepEqual(s.stages!.find((x) => x.id === "post")!.parts, [{ label: "Post", waiting: 1 }]);
  assert.match(s.needsMe!.find((n) => n.key === "gate:post:internal")!.where!, /PUBLISHED/);
  assert.equal(s.needsMe!.find((n) => n.key === "gate:post:internal")!.clear, undefined);
});

test("a client with a price of 0 is not counted as paying", () => {
  const free: ClientRecord = { ...kopi, openedAt: NOW.toISOString(), price: 0, perMonth: 6 };
  const s = buildSnapshot({ registry: withClients(shipped, [free]), view: { mode: "owner", account: "all" }, runs: {}, events: [], gates: { "invoice:internal": { waiting: 0, at: NOW.toISOString() } }, probes: [], funnel: null, clients: [free], now: NOW });
  assert.deepEqual(s.money, { monthly: 0, priced: 0, clients: 1, invoices: undefined });
  assert.match(s.stages!.find((x) => x.id === "paid")!.note!, /no paying client yet/);
  assert.ok(!s.needsMe!.some((n) => n.key.startsWith("price:")), "an explicit 0 is a decision, not a missing price");
});

test("ownerReport and answerCommand read the owner snapshot and give clients nothing", () => {
  const priced: ClientRecord = { ...kopi, price: 500, perMonth: 4, openedAt: NOW.toISOString() };
  const r = withClients(shipped, [priced]);
  const gates = { "dm:internal": { waiting: 3, oldestAt: new Date(NOW.getTime() - 5 * 86400_000).toISOString(), at: NOW.toISOString() } };
  const s = buildSnapshot({ registry: r, view: { mode: "owner", account: "all" }, runs: {}, events: [], gates, probes: [], funnel: null, clients: [priced], now: NOW });
  const report = ownerReport(s);
  assert.match(report, /^KNOX Mission Control · 2026-11-07/);
  assert.match(report, /Needs me: 1 \(1 overdue\)/);
  assert.match(report, /01 Audience: 3 waiting · OVERDUE/);
  assert.match(report, /RM2,000 a month agreed with 1 of 1 clients/);

  assert.equal(answerCommand("report", s).tab, "reports");
  assert.equal(answerCommand("/report", s).reply, report);
  assert.match(answerCommand("needs", s).reply, /^1 waiting on you:/);
  assert.match(answerCommand("TODAY", s).reply, /^1 overdue or due today:/);
  assert.equal(answerCommand("money", s).tab, "money");
  assert.match(answerCommand("", s).reply, /I only read/);
  assert.match(answerCommand("quote Kopi Kita 4 reels at 500", s).reply, /nothing was added/);
  assert.match(answerCommand("dance", s).reply, /I do not know "dance"/);

  const c = buildSnapshot({ registry: r, view: { mode: "client", account: "kopi-kita" }, runs: {}, events: [], gates, probes: [], funnel: null, clients: [priced], now: NOW });
  assert.equal(ownerReport(c), "");
  assert.doesNotMatch(answerCommand("money", c).reply, /RM/);
});

test("client categories: Creator and Talent under one heading, Brand on its own, owner only", () => {
  assert.deepEqual(CLIENT_CATEGORIES.map((c) => [c.id, c.group]), [["creator", "Creator / Talent"], ["talent", "Creator / Talent"], ["brand", "Brand"]]);
  assert.deepEqual(clientCategory("brand"), { ok: true, value: "brand" });
  assert.deepEqual(clientCategory(""), { ok: true, value: undefined });
  assert.equal(clientCategory("kol").ok, false);
  // The category never reaches a client's own page or the registry the laptop reads.
  const brand: ClientRecord = { ...kopi, category: "brand" };
  const r = withClients(shipped, [brand]);
  const c = buildSnapshot({ registry: r, view: { mode: "client", account: "kopi-kita" }, runs: {}, events: [], gates: {}, probes: [], funnel: null, clients: [brand], now: NOW });
  assert.doesNotMatch(JSON.stringify(c), /"category"/);
  assert.doesNotMatch(JSON.stringify(publicRegistry(r)), /"category"/);
});

test("talent commission: a percentage of each job, counted apart from retainers, owner only", () => {
  assert.deepEqual(commissionOf("20"), { ok: true, value: 20 });
  assert.deepEqual(commissionOf(""), { ok: true, value: undefined });
  assert.equal(commissionOf("120").ok, false);
  assert.deepEqual(talentJob({ brand: " Brand  X ", fee: "3000", date: "2026-11-05" }, 20), { ok: true, value: { brand: "Brand X", fee: 3000, percent: 20, date: "2026-11-05" } });
  assert.equal((talentJob({ brand: "Brand X", fee: "3000", date: "2026-11-05", percent: "15" }, 20) as { value: { percent: number } }).value.percent, 15);
  assert.match((talentJob({ brand: "Brand X", fee: "3000", date: "2026-11-05" }, undefined) as { error: string }).error, /commission first/);
  assert.equal(talentJob({ brand: "Brand X", fee: "0", date: "2026-11-05" }, 20).ok, false);
  assert.equal(talentJob({ brand: "Brand X", fee: "10", date: "soon" }, 20).ok, false);
  assert.equal(cutOf({ fee: 3333, percent: 12.5 }), 416.63);

  const talent: ClientRecord = { ...kopi, id: "our-talent", label: "Our Talent", category: "talent", commission: 20, price: 9999, perMonth: 4, openedAt: NOW.toISOString(), jobs: [
    { id: "a", brand: "Brand X", fee: 3000, percent: 20, date: "2026-11-05", paidAt: "2026-11-06T00:00:00.000Z" },
    { id: "b", brand: "Brand Y", fee: 1000, percent: 30, date: "2026-11-06" },
    { id: "c", brand: "Brand Z", fee: 500, percent: 20, date: "2026-10-20" },
  ] };
  const creator: ClientRecord = { ...kopi, category: "creator", price: 500, perMonth: 4, openedAt: NOW.toISOString(), jobs: [{ id: "x", brand: "Ignored", fee: 9000, percent: 50, date: "2026-11-01" }] };
  assert.deepEqual(talentMoney([talent, creator], "2026-11"), { talents: 1, jobs: 3, fees: 4500, cut: 1000, received: 600, outstanding: 400, thisMonth: 900 });

  const r = withClients(shipped, [talent, creator]);
  const s = buildSnapshot({ registry: r, view: { mode: "owner", account: "all" }, runs: {}, events: [], gates: { "invoice:internal": { waiting: 0, at: NOW.toISOString() } }, probes: [], funnel: null, clients: [talent, creator], now: NOW });
  // The talent's stray price is never counted as income; only the creator's retainer is.
  assert.deepEqual([s.money!.monthly, s.money!.priced, s.money!.clients], [2000, 1, 2]);
  assert.equal(s.money!.talent!.outstanding, 400);
  assert.match(s.stages!.find((x) => x.id === "paid")!.note!, /RM400 talent commission outstanding/);
  assert.match(ownerReport(s), /Talent commission: RM900 this month · RM400 outstanding · RM600 received \(3 jobs\)/);
  assert.equal(s.needsMe!.some((n) => n.key === "price:our-talent"), false);

  // A talent with no commission is asked for one, not for a price.
  const fresh: ClientRecord = { ...talent, commission: undefined, jobs: [] };
  const f = buildSnapshot({ registry: withClients(shipped, [fresh]), view: { mode: "owner", account: "all" }, runs: {}, events: [], gates: {}, probes: [], funnel: null, clients: [fresh], now: NOW });
  assert.equal(f.needsMe!.find((n) => n.key === "price:our-talent")!.title, "Set the commission for Our Talent");
  assert.equal(onboarding(fresh, {}, {}).find((x) => x.id === "price")!.label, "Commission agreed");

  const c = buildSnapshot({ registry: r, view: { mode: "client", account: "our-talent" }, runs: {}, events: [], gates: {}, probes: [], funnel: null, clients: [talent, creator], now: NOW });
  assert.doesNotMatch(JSON.stringify(c), /commission|"fee"|Brand X/i);
});

test("talent jobs: invoices.md decides what is received, matched by a short reference", async () => {
  const { jobRef, jobInvoiceLine, cleanJobSync, syncJobs } = await import("../lib/station.ts");
  const job = { id: "1a2b3c4d-0000-4000-8000-000000000000", brand: "Brand · X", fee: 3000, percent: 20, date: "2026-11-05" };
  assert.equal(jobRef(job.id), "1a2b3c4d");
  assert.equal(jobInvoiceLine(job, "Our Talent", "2026-11-16"), "- [ ] INV-000 · Brand X commission (Our Talent) · RM 600 · sent 2026-11-16 · due 2026-11-30 · job 1a2b3c4d");
  // Only well-formed references and dates survive.
  assert.deepEqual(cleanJobSync({ paid: [{ ref: "1a2b3c4d", on: "2026-11-20" }, { ref: "../etc" }, { ref: "aaaaaaaa", on: "soon" }], open: ["bbbbbbbb", 7, "nope"] }),
    { paid: [{ ref: "1a2b3c4d", on: "2026-11-20" }, { ref: "aaaaaaaa" }], open: ["bbbbbbbb"] });
  const other = { id: "bbbbbbbb-0000-4000-8000-000000000000", brand: "Y", fee: 1000, percent: 10, date: "2026-11-06", paidAt: "2026-11-07T00:00:00.000Z" };
  const untouched = { id: "cccccccc-0000-4000-8000-000000000000", brand: "Z", fee: 1000, percent: 10, date: "2026-11-06", paidAt: "2026-11-08T00:00:00.000Z" };
  const c = { id: "t", label: "T", createdAt: "2026-11-01T00:00:00.000Z", keyHash: "h", status: "active" as const, category: "talent" as const, jobs: [job, other, untouched] };
  const now = "2026-11-21T03:00:00.000Z";
  const [changed] = syncJobs([c], { paid: [{ ref: "1a2b3c4d", on: "2026-11-20" }], open: ["bbbbbbbb"] }, now);
  assert.equal(changed.jobs![0].paidAt, "2026-11-19T16:00:00.000Z"); // 20 Nov, Malaysia time
  assert.equal("paidAt" in changed.jobs![1], false); // unticked in the file: not received
  assert.equal(changed.jobs![2].paidAt, untouched.paidAt); // no line in the file: left alone
  assert.deepEqual(syncJobs([changed], { paid: [{ ref: "1a2b3c4d", on: "2026-11-20" }], open: ["bbbbbbbb"] }, now), []); // nothing to write twice
  assert.equal(syncJobs([c], { paid: [{ ref: "1a2b3c4d" }], open: [] }, now)[0].jobs![0].paidAt, now); // ticked with no date
});

test("a Creator is asked for a price per reel; a Brand goes through Onboarding instead", () => {
  const base = { ...kopi, openedAt: NOW.toISOString() };
  const clients: ClientRecord[] = [{ ...base, id: "brand-co", label: "Brand Co", category: "brand" }, { ...base, id: "creator-co", label: "Creator Co", category: "creator" }, { ...base, id: "plain-co", label: "Plain Co" }];
  const r = withClients(shipped, clients);
  const s = buildSnapshot({ registry: r, view: { mode: "owner", account: "all" }, runs: {}, events: [], gates: { "invoice:internal": { waiting: 0, at: NOW.toISOString() } }, probes: [], funnel: null, clients, now: NOW });
  const of = (id: string) => s.needsMe!.find((n) => n.key === `price:${id}`)!;
  assert.deepEqual([of("brand-co").title, of("brand-co").detail], ["Add Brand Co's job: category and fee", "What kind of job, for what, and what they pay"]);
  assert.deepEqual([of("creator-co").title, of("creator-co").detail], ["Set the price for Creator Co", "Nothing can be invoiced without a price per reel"]);
  assert.equal(of("plain-co").title, "Set the price for Plain Co");
  assert.deepEqual(onboarding(clients[0], {}, {}).map((x) => [x.id, x.done]), [["register", true], ["category", false], ["fee", false], ["invoice", false], ["opened", true]]);
  assert.equal(onboarding(clients[1], {}, {}).find((x) => x.id === "price")!.label, "Price agreed");
});

test("onboarding department: register, category, fee, invoice for a brand job", async () => {
  const { brandJob, brandJobFee, brandJobStep, brandInvoiceLine, brandMoney, syncJobs, checkRegistry } = await import("../lib/station.ts");
  assert.deepEqual(checkRegistry(shipped), []);
  assert.deepEqual(shipped.departments[0].desks.map((d) => d.name), ["Register", "Category", "Fee", "Invoice"]);
  // Category and fee: paid kinds need a fee, gifted and loan may start at 0 (and are then asked for one).
  assert.deepEqual(brandJob({ deal: "paid-unit", what: " Wireless  Micro ", fee: "500", date: "2026-11-20" }), { ok: true, value: { deal: "paid-unit", what: "Wireless Micro", fee: 500, date: "2026-11-20" } });
  assert.match((brandJob({ deal: "paid", what: "Mic", fee: "0", date: "2026-11-20" }) as { error: string }).error, /needs a fee/);
  assert.equal(brandJob({ deal: "gifted", what: "Mic", fee: "", date: "2026-11-20" }).ok, true);
  assert.equal(brandJob({ deal: "kol", what: "Mic", fee: "1", date: "2026-11-20" }).ok, false);
  assert.equal(brandJob({ deal: "loan", what: "Mic", fee: "-5", date: "2026-11-20" }).ok, false);

  const gifted = { id: "1a2b3c4d-0000-4000-8000-000000000000", deal: "gifted" as const, what: "Light · Pro", fee: 0, date: "2026-11-18" };
  const paid = { id: "eeeeeeee-0000-4000-8000-000000000000", deal: "paid" as const, what: "Phone", fee: 800, date: "2026-11-02" };
  assert.equal(brandJobStep(gifted), "fee");
  assert.deepEqual(brandJobFee(gifted, "500"), { ok: true, value: 500 });
  assert.equal(brandJobFee({ ...paid, invoicedAt: NOW.toISOString() }, "900").ok, false); // the file owns it once invoiced
  assert.equal(brandInvoiceLine({ ...gifted, fee: 500 }, "Brand Co", "2026-11-20"), "- [ ] INV-000 · Brand Co · Gifted review: Light Pro · RM 500 · sent 2026-11-20 · due 2026-12-04 · job 1a2b3c4d");

  const brand: ClientRecord = { ...kopi, id: "brand-co", label: "Brand Co", category: "brand", brandJobs: [gifted, paid] };
  // Newest job drives the four steps.
  assert.deepEqual(onboarding(brand, {}, {}).slice(0, 4).map((x) => [x.id, x.done]), [["register", true], ["category", true], ["fee", false], ["invoice", false]]);

  const r = withClients(shipped, [brand]);
  const s = buildSnapshot({ registry: r, view: { mode: "owner", account: "all" }, runs: {}, events: [], gates: { "invoice:internal": { waiting: 0, at: NOW.toISOString() } }, probes: [], funnel: null, clients: [brand], now: NOW });
  const keys = s.needsMe!.map((n) => n.key);
  assert.ok(keys.includes("fee:brand-co:1a2b3c4d"));
  assert.ok(keys.includes("bill:brand-co:eeeeeeee"));
  assert.equal(keys.includes("link:brand-co"), false); // a brand is not nagged for its link
  assert.equal(s.needsMe!.find((n) => n.key === "fee:brand-co:1a2b3c4d")!.title, "Ask Brand Co for a fee");
  assert.deepEqual(s.money!.brand, { brands: 1, jobs: 2, noFee: 1, agreed: 800, toInvoice: 800, outstanding: 0, received: 0, thisMonth: 800 });
  assert.match(s.stages!.find((x) => x.id === "paid")!.note!, /RM800 brand fees not invoiced/);
  assert.match(ownerReport(s), /Brand jobs: RM800 agreed \(2 jobs\) · RM800 to invoice · RM0 unpaid · RM0 received · 1 without a fee/);

  // invoices.md: a line showing up is the Invoice step; ticking it is paid.
  const now = "2026-11-21T03:00:00.000Z";
  const [inv] = syncJobs([brand], { paid: [], open: ["eeeeeeee"] }, now);
  assert.equal(inv.brandJobs![1].invoicedAt, now);
  assert.equal(brandJobStep(inv.brandJobs![1]), "unpaid");
  assert.equal(inv.jobs, undefined); // no talent jobs appear out of nowhere
  const [done] = syncJobs([inv], { paid: [{ ref: "eeeeeeee", on: "2026-11-25" }], open: [] }, "2026-11-26T00:00:00.000Z");
  assert.deepEqual([done.brandJobs![1].invoicedAt, brandJobStep(done.brandJobs![1])], [now, "paid"]);
  assert.deepEqual(brandMoney([done], "2026-11").received, 800);

  // None of it reaches the brand's own page.
  const c = buildSnapshot({ registry: r, view: { mode: "client", account: "brand-co" }, runs: {}, events: [], gates: {}, probes: [], funnel: null, clients: [brand], now: NOW });
  assert.doesNotMatch(JSON.stringify(c), /brandJobs|Phone|Light|"fee"|onboarding/i);
});

test("brand requests from the public /onboarding page: checked, shown on Needs me, accepted into a Brand", async () => {
  const { cleanBrandRequest, acceptBrandRequest } = await import("../lib/station.ts");
  const ok = cleanBrandRequest({ brand: " Rode ", reach: "+60 12-345 6789", deal: "paid-unit", what: "Wireless Micro", offer: "700", instagram: "https://instagram.com/Rode/", website: "x" });
  assert.deepEqual(ok, { ok: true, value: { brand: "Rode", reach: "+60 12-345 6789", deal: "paid-unit", what: "Wireless Micro", instagram: "rode", offer: 700 } });
  assert.equal((cleanBrandRequest({ brand: "Rode", reach: "hi", deal: "paid", what: "Mic" }) as { error: string }).error, "Add a WhatsApp number or an email we can reply to.");
  assert.equal(cleanBrandRequest({ brand: "Rode", reach: "a@b.co", deal: "kol", what: "Mic" }).ok, false);
  assert.equal(cleanBrandRequest({ brand: "Rode", reach: "a@b.co", deal: "gifted", what: "Mic", offer: "-1" }).ok, false);
  assert.equal(cleanBrandRequest(null).ok, false);

  const q = { id: "q1", at: NOW.toISOString(), consentVersion: "v", consentAt: NOW.toISOString(), ...(ok as { value: Record<string, unknown> }).value } as Parameters<typeof acceptBrandRequest>[0];
  // A new brand becomes a Brand client with the offered fee on its first job.
  const fresh = acceptBrandRequest(q, [], new Set(), "2026-11-20");
  assert.deepEqual(fresh, { ok: true, client: { id: "rode", label: "Rode", instagram: "rode" }, job: { deal: "paid-unit", what: "Wireless Micro", fee: 700, date: "2026-11-20" } });
  // A brand already on the board gets the job instead of a second card.
  const known: ClientRecord = { ...kopi, id: "rode", label: "Rode", category: "brand", brandJobs: [] };
  assert.equal((acceptBrandRequest(q, [known], new Set(["rode"]), "2026-11-20") as { existing?: ClientRecord }).existing?.id, "rode");
  // A creator with the same short name is not taken over: the brand needs another name.
  assert.equal(acceptBrandRequest(q, [{ ...known, category: "creator" }], new Set(["rode"]), "2026-11-20").ok, false);

  const s = buildSnapshot({ registry: shipped, view: { mode: "owner", account: "all" }, runs: {}, events: [], gates: {}, probes: [], funnel: null, clients: [], requests: [q], now: NOW });
  const n = s.needsMe!.find((x) => x.key === "request:q1")!;
  assert.deepEqual([n.title, n.detail, n.stage], ["New brand request: Rode", "Paid + unit: Wireless Micro · offers RM700", "onboard"]);
  const c = buildSnapshot({ registry: withClients(shipped, [kopi]), view: { mode: "client", account: "kopi-kita" }, runs: {}, events: [], gates: {}, probes: [], funnel: null, clients: [kopi], requests: [q], now: NOW });
  assert.doesNotMatch(JSON.stringify(c), /Rode|6789|request/);
});

test("client history: who was added or removed, and whether from the page or a script", async () => {
  const { clientLogEntry } = await import("../lib/station.ts");
  assert.deepEqual(clientLogEntry("removed", { id: "rode", label: "Pixel Distribution" }, false, "2026-11-15T20:00:00.000Z"),
    { at: "2026-11-15T20:00:00.000Z", action: "removed", id: "rode", label: "Pixel Distribution", via: "page" });
  assert.equal(clientLogEntry("added", { id: "x", label: "X".repeat(90) }, true, "2026-11-15T20:00:00.000Z").via, "key");
  assert.equal(clientLogEntry("added", { id: "x", label: "X".repeat(90) }, true, "2026-11-15T20:00:00.000Z").label.length, 60);
});
