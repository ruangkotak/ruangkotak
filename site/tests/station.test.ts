import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  alertable, alertText, planAlerts, REPEAT_MS, type NeedsYou, accountPanel, type ReelSnapshot,
  applyBeat, buildSnapshot, isDue, clientJobs, hashKey, onboarding, publicRegistry, slugify, validateClient, withClients, type ClientRecord, checkRegistry, clientKeyName, cookieFor, cookieScope, eventFor, jobView, keyScope, nextCron,
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
  assert.deepEqual(fresh.map((s) => [s.id, s.done]), [["link", true], ["opened", false], ["velocity", false], ["final", false]]);
  const runs = {
    "kopi-kita-velocity": applyBeat([], { kind: "job", jobId: "kopi-kita-velocity", state: "ok" }, NOW),
    "kopi-kita-final-check": applyBeat([], { kind: "job", jobId: "kopi-kita-final-check", state: "ok" }, NOW),
  };
  const later = onboarding({ ...kopi, openedAt: NOW.toISOString() }, runs, { "final:kopi-kita": { waiting: 2, at: NOW.toISOString() } });
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
  assert.equal(alertText(plan, "https://ruangkotak.com/station#alerts"),
    "Station needs you (1)\n• Security Officer: credential-registry failing (last 3 runs exited 1, 1, 1)\n\nResolved\n✓ Billing Clerk: 1 invoice past due\n\nhttps://ruangkotak.com/station#alerts");
  assert.match(alertText(planAlerts([], prev, NOW), "L")!, /^Station: cleared\n✓ Billing Clerk/);
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

test("a client's page shows only their reels and items; the owner's all-accounts view has no account panel", () => {
  const gates = {
    "final:client-demo": { waiting: 1, at: NOW.toISOString(), items: [{ label: "Demo reel", at: NOW.toISOString() }] },
    "final:alanazizreview": { waiting: 1, at: NOW.toISOString(), items: [{ label: "Alan secret project", at: NOW.toISOString() }] },
  };
  const client = snapshot({ mode: "client", account: "client-demo" }, { gates, reels: [snapAt(0, [["D", 5, 100]])] });
  assert.equal(client.account?.label, "Client demo");
  assert.ok(!JSON.stringify(client).includes("Alan secret project"));
  assert.equal(snapshot({ mode: "owner", account: "all" }, { gates }).account, undefined);
  assert.equal(snapshot({ mode: "owner", account: "internal" }, { gates }).account, undefined);
});
