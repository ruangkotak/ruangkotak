// Station: the private operations board at /station. Everything in this file is pure (no I/O, no store, no env reads
// unless an env object is passed in) so it runs under `node --test`. The I/O half lives in lib/station-live.ts.
//
// Vocabulary
//   registry  data/station/registry.json: accounts, departments, desks, jobs, gates. Hand-edited.
//   beat      what a job sends to POST /api/station/beat: start / ok / fail for a job, or a gate reading.
//   run       one execution of a job, built from its beats. The last 10 are kept per job.
//   snapshot  everything the page draws, already filtered for who is looking (owner or one client).
import { createHmac, timingSafeEqual } from "node:crypto";

// ---------- registry ----------

export type AccountKind = "internal" | "personal" | "client";
export type Account = { id: string; label: string; kind: AccountKind; funnel: "site" | null; instagram?: string };
export type Desk = { id: string; name: string; agent?: string; noReadPath?: boolean };
export type Department = { id: string; no: string; name: string; client: boolean; desks: Desk[] };
/** `script` names the laptop job file when several jobs share one (default: the job id). */
export type Job = { id: string; desk: string; schedule: string; account: string; script?: string };
export type Gate = { id: string; label: string; detail: string; reviewer: string; job: string | null; slaHours: number };
export type Registry = { accounts: Account[]; gates: Gate[]; departments: Department[]; jobs: Job[] };

/** Problems with a registry, as readable lines. Empty means it is usable. */
export function checkRegistry(r: Registry): string[] {
  const errors: string[] = [];
  const desks = new Map<string, string>();
  const ids = new Set<string>();
  for (const d of r.departments)
    for (const k of d.desks) {
      if (desks.has(k.id)) errors.push(`desk ${k.id} is listed twice`);
      desks.set(k.id, d.id);
    }
  const accounts = new Set(r.accounts.map((a) => a.id));
  if (!accounts.has("internal")) errors.push("an 'internal' account is required");
  for (const a of r.accounts) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(a.id)) errors.push(`account id ${a.id} must be lowercase letters, digits and dashes`);
    if (a.instagram !== undefined && !/^[a-z0-9._]{2,30}$/.test(a.instagram)) errors.push(`account ${a.id} has an invalid instagram handle (no @, lowercase)`);
  }
  for (const j of r.jobs) {
    if (ids.has(j.id)) errors.push(`job ${j.id} is listed twice`);
    ids.add(j.id);
    if (!desks.has(j.desk)) errors.push(`job ${j.id} points at unknown desk ${j.desk}`);
    if (!accounts.has(j.account)) errors.push(`job ${j.id} points at unknown account ${j.account}`);
    if (!parseSchedule(j.schedule)) errors.push(`job ${j.id} has an unreadable schedule "${j.schedule}"`);
    if (j.script !== undefined && !/^[a-z0-9-]{1,60}$/.test(j.script)) errors.push(`job ${j.id} has an invalid script name`);
  }
  for (const g of r.gates) {
    if (!desks.has(g.reviewer)) errors.push(`gate ${g.id} points at unknown reviewer desk ${g.reviewer}`);
    if (g.job && !ids.has(g.job)) errors.push(`gate ${g.id} points at unknown job ${g.job}`);
  }
  return errors;
}

// ---------- schedules ----------
// Cron is read in Malaysia time (UTC+8, no daylight saving), like the funnel counters.

const TZ = 8 * 3600_000;
const MIN = 60_000;

type Cron = { min: Set<number>; hour: Set<number>; dom: Set<number>; mon: Set<number>; dow: Set<number>; domAny: boolean; dowAny: boolean };
export type Schedule = { kind: "interval"; ms: number; text: string } | { kind: "cron"; cron: Cron; text: string };

function cronField(src: string, lo: number, hi: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of src.split(",")) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[4] ? Number(m[4]) : 1;
    const a = m[1] === "*" ? lo : Number(m[2]);
    const b = m[1] === "*" ? hi : m[3] !== undefined ? Number(m[3]) : m[4] ? hi : a;
    if (step < 1 || a < lo || b > hi || a > b) return null;
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}

export function parseSchedule(text: string): Schedule | null {
  const every = /^every\s+(\d+)\s*([mh])$/i.exec(text.trim());
  if (every) {
    const n = Number(every[1]);
    return n > 0 ? { kind: "interval", ms: n * (every[2].toLowerCase() === "h" ? 60 : 1) * MIN, text } : null;
  }
  const f = text.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [min, hour, dom, mon, dowRaw] = [cronField(f[0], 0, 59), cronField(f[1], 0, 23), cronField(f[2], 1, 31), cronField(f[3], 1, 12), cronField(f[4], 0, 7)];
  if (!min || !hour || !dom || !mon || !dowRaw) return null;
  const dow = new Set([...dowRaw].map((d) => d % 7)); // 7 is Sunday too
  return { kind: "cron", cron: { min, hour, dom, mon, dow, domAny: f[2] === "*", dowAny: f[4] === "*" }, text };
}

/** The first cron fire strictly after `from`. */
export function nextCron(cron: Cron, from: Date): Date | null {
  // Work on a clock shifted to Malaysia time and read it with UTC getters.
  let t = Math.floor((from.getTime() + TZ) / MIN) * MIN + MIN;
  for (let i = 0; i < 50_000; i++) {
    const d = new Date(t);
    const y = d.getUTCFullYear(), mo = d.getUTCMonth(), day = d.getUTCDate(), h = d.getUTCHours();
    if (!cron.mon.has(mo + 1)) { t = Date.UTC(y, mo + 1, 1); continue; }
    const domOk = cron.dom.has(day), dowOk = cron.dow.has(d.getUTCDay());
    // Standard cron: when both day fields are restricted, either one matching is enough.
    const dayOk = cron.domAny && cron.dowAny ? true : cron.domAny ? dowOk : cron.dowAny ? domOk : domOk || dowOk;
    if (!dayOk) { t = Date.UTC(y, mo, day + 1); continue; }
    if (!cron.hour.has(h)) { t = Date.UTC(y, mo, day, h + 1); continue; }
    if (!cron.min.has(d.getUTCMinutes())) { t += MIN; continue; }
    return new Date(t - TZ);
  }
  return null;
}

/** When the job should run next: after its last start, or from now if it never ran. Intervals that never ran have no date. */
export function nextRunAt(schedule: Schedule, lastStart: Date | null, now: Date): Date | null {
  if (schedule.kind === "interval") return lastStart ? new Date(lastStart.getTime() + schedule.ms) : null;
  return nextCron(schedule.cron, lastStart ?? now);
}

/** What the laptop scheduler remembers per job: when it last started it, and (for cron) when it last looked. */
export type TickEntry = { lastStart?: string; lastCheck?: string };

/**
 * Whether the laptop should run a job now. Intervals run when they never ran or their gap has passed.
 * Cron runs when a fire time fell between the last look and now, so a laptop that slept through 03:00
 * catches up once on wake instead of firing every missed slot. A cron job seen for the first time waits for its next slot.
 */
export function isDue(schedule: Schedule, e: TickEntry, now: Date): boolean {
  if (schedule.kind === "interval") return !e.lastStart || Date.parse(e.lastStart) + schedule.ms <= now.getTime();
  if (!e.lastCheck) return false;
  const next = nextCron(schedule.cron, new Date(e.lastCheck));
  return !!next && next.getTime() <= now.getTime();
}

// ---------- runs and beats ----------

export type Run = { startAt?: string; endAt?: string; ok?: boolean; exitCode?: number; message?: string; source?: string };
export type JobBeat = { kind: "job"; jobId: string; state: "start" | "ok" | "fail"; exitCode?: number; message?: string; source?: string };
export type GateBeat = { kind: "gate"; gate: string; account: string; waiting: number; oldestAt?: string; source?: string };
export type Beat = JobBeat | GateBeat;
export type GateReading = { waiting: number; oldestAt?: string; at: string };

export const KEEP_RUNS = 10;
const SOURCE = /^[a-z0-9][a-z0-9-]{0,23}$/;

/** Validates a beat body against the registry. Messages are trimmed to 200 characters; they must never carry personal data. */
export function parseBeat(body: unknown, r: Registry): { ok: true; beat: Beat } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const source = b.source === undefined ? undefined : typeof b.source === "string" && SOURCE.test(b.source) ? b.source : null;
  if (source === null) return { ok: false, error: "source must be 1-24 lowercase letters, digits or dashes" };
  if (b.gate !== undefined) {
    const gate = r.gates.find((g) => g.id === b.gate);
    if (!gate) return { ok: false, error: "unknown gate" };
    const account = b.account ?? "internal";
    if (typeof account !== "string" || !r.accounts.some((a) => a.id === account)) return { ok: false, error: "unknown account" };
    if (!Number.isInteger(b.waiting) || (b.waiting as number) < 0 || (b.waiting as number) > 100_000) return { ok: false, error: "waiting must be a whole number" };
    if (b.oldestAt !== undefined && (typeof b.oldestAt !== "string" || Number.isNaN(Date.parse(b.oldestAt)))) return { ok: false, error: "oldestAt must be an ISO date" };
    return { ok: true, beat: { kind: "gate", gate: gate.id, account, waiting: b.waiting as number, oldestAt: b.oldestAt as string | undefined, source } };
  }
  if (typeof b.jobId !== "string" || !r.jobs.some((j) => j.id === b.jobId)) return { ok: false, error: "unknown jobId" };
  if (b.state !== "start" && b.state !== "ok" && b.state !== "fail") return { ok: false, error: "state must be start, ok or fail" };
  if (b.exitCode !== undefined && !Number.isInteger(b.exitCode)) return { ok: false, error: "exitCode must be an integer" };
  if (b.message !== undefined && typeof b.message !== "string") return { ok: false, error: "message must be a string" };
  const message = (b.message as string | undefined)?.replace(/\s+/g, " ").trim().slice(0, 200) || undefined;
  return { ok: true, beat: { kind: "job", jobId: b.jobId, state: b.state, exitCode: b.exitCode as number | undefined, message, source } };
}

/** Folds one job beat into its run list (newest first, at most KEEP_RUNS). A finish closes the open run, or stands alone. */
export function applyBeat(runs: Run[], beat: JobBeat, now: Date): Run[] {
  const at = now.toISOString();
  const head = runs[0];
  if (beat.state === "start") return [{ startAt: at, source: beat.source, message: beat.message }, ...runs].slice(0, KEEP_RUNS);
  const ok = beat.state === "ok";
  const exitCode = beat.exitCode ?? (ok ? 0 : 1);
  const end: Run = { endAt: at, ok, exitCode, message: beat.message, source: beat.source };
  if (head?.startAt && !head.endAt) return [{ ...head, ...end, message: beat.message ?? head.message, source: beat.source ?? head.source }, ...runs.slice(1)];
  return [end, ...runs].slice(0, KEEP_RUNS);
}

// ---------- derived state ----------

export type JobState = "running" | "stuck" | "failing" | "due" | "scheduled" | "never";
export type DeskState = "running" | "stuck" | "due" | "failing" | "scheduled" | "idle" | "no-read";
export type JobView = {
  id: string; desk: string; deskName: string; dept: string; account: string; schedule: string;
  state: JobState; reason?: string; nextAt: string | null; startedAt?: string; lastEndAt?: string; lastMessage?: string;
  runs: { ok: boolean | null; exitCode?: number; at: string }[];
};

/** A run that started but has not finished after this long counts as hung, which is stuck. */
export const HUNG_MS = 60 * MIN;
/** A run past its time by less than this still reads as due, not late. */
const GRACE_MS = 2 * MIN;
const RANK: Record<JobState, number> = { stuck: 0, running: 1, due: 2, failing: 3, scheduled: 4, never: 5 };

export function jobView(job: Job, r: Registry, runs: Run[], now: Date): JobView {
  const dept = r.departments.find((d) => d.desks.some((k) => k.id === job.desk))!;
  const desk = dept.desks.find((k) => k.id === job.desk)!;
  const schedule = parseSchedule(job.schedule);
  const lastStart = runs.find((x) => x.startAt)?.startAt ?? runs[0]?.endAt;
  const nextAt = schedule ? nextRunAt(schedule, lastStart ? new Date(lastStart) : null, now) : null;
  const finished = runs.filter((x) => x.endAt);
  const open = runs[0]?.startAt && !runs[0].endAt ? runs[0] : undefined;
  let state: JobState;
  let reason: string | undefined;
  const failStreak = finished.findIndex((x) => x.ok) === -1 ? finished.length : finished.findIndex((x) => x.ok);
  if (open && now.getTime() - Date.parse(open.startAt!) > HUNG_MS) {
    state = "stuck";
    reason = `started ${ago(Date.parse(open.startAt!), now)} ago and never finished`;
  } else if (open) state = "running";
  else if (failStreak >= 3) {
    state = "stuck";
    const codes = finished.slice(0, 3).map((x) => x.exitCode ?? 1).join(", ");
    reason = failStreak > 3 ? `${failStreak} failed runs in a row, latest exits ${codes}` : `last 3 runs exited ${codes}`;
  } else if (finished[0] && !finished[0].ok) {
    state = "failing";
    reason = `last run exited ${finished[0].exitCode ?? 1}${finished[0].message ? `: ${finished[0].message}` : ""}`;
  } else if (!runs.length && !nextAt) state = "never";
  else if (nextAt && nextAt.getTime() <= now.getTime() - GRACE_MS && runs.length) state = "due";
  else state = nextAt ? "scheduled" : "never";
  return {
    id: job.id, desk: desk.id, deskName: desk.name, dept: dept.id, account: job.account, schedule: job.schedule,
    state, reason, nextAt: nextAt?.toISOString() ?? null, startedAt: open?.startAt, lastEndAt: finished[0]?.endAt, lastMessage: finished[0]?.message,
    runs: runs.slice(0, KEEP_RUNS).map((x) => ({ ok: x.endAt ? !!x.ok : null, exitCode: x.exitCode, at: (x.endAt ?? x.startAt)! })),
  };
}

export function deskState(desk: Desk, jobs: JobView[]): DeskState {
  if (desk.noReadPath) return "no-read";
  const mine = jobs.filter((j) => j.desk === desk.id);
  if (!mine.length) return "idle";
  const best = mine.reduce((a, b) => (RANK[b.state] < RANK[a.state] ? b : a));
  return best.state === "never" ? "idle" : best.state;
}

export function ago(t: number, now: Date) {
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h${m % 60 ? ` ${m % 60}m` : ""}` : `${Math.floor(h / 24)}d`;
}

// ---------- access ----------

export type Scope = { kind: "owner" } | { kind: "client"; account: string };
export type Env = Record<string, string | undefined>;
export const COOKIE = "rk_station";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** CLIENT_KEY_<SLUG>: the slug upper-cased, anything not a letter or digit turned into "_" (client-demo → CLIENT_KEY_CLIENT_DEMO). */
export const clientKeyName = (account: string) => `CLIENT_KEY_${account.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
const sign = (secret: string, scope: string) => createHmac("sha256", secret).update(`rk-station:${scope}`).digest("hex");
const shareable = (r: Registry, account: string) => r.accounts.some((a) => a.id === account && a.kind !== "internal");

/** Who a raw key belongs to. STATION_KEY is the owner; CLIENT_KEY_<SLUG> opens that one account. Missing env vars open nothing. */
export function keyScope(key: string | null | undefined, account: string | null | undefined, env: Env, r: Registry): Scope | null {
  if (!key) return null;
  if (env.STATION_KEY && same(key, env.STATION_KEY)) return { kind: "owner" };
  if (account && shareable(r, account)) {
    const secret = env[clientKeyName(account)];
    if (secret && same(key, secret)) return { kind: "client", account };
  }
  return null;
}

/** The session cookie holds a signature derived from the key, never the key itself; rotating the key ends every session. */
export function cookieFor(scope: Scope, env: Env): string | null {
  if (scope.kind === "owner") return env.STATION_KEY ? `owner.${sign(env.STATION_KEY, "owner")}` : null;
  const secret = env[clientKeyName(scope.account)];
  return secret ? `client.${scope.account}.${sign(secret, `client:${scope.account}`)}` : null;
}

export function cookieScope(value: string | null | undefined, env: Env, r: Registry): Scope | null {
  if (!value) return null;
  const [kind, a, b] = value.split(".");
  if (kind === "owner" && a && env.STATION_KEY) return same(a, sign(env.STATION_KEY, "owner")) ? { kind: "owner" } : null;
  if (kind === "client" && a && b && shareable(r, a)) {
    const secret = env[clientKeyName(a)];
    return secret && same(b, sign(secret, `client:${a}`)) ? { kind: "client", account: a } : null;
  }
  return null;
}

export type ViewQuery = { view?: string | null; account?: string | null };
export type View = { mode: "owner"; account: string } | { mode: "client"; account: string };

/** What a scope may look at. A client only ever sees its own account; asking for anything else is a 404. */
export function resolveView(scope: Scope | null, q: ViewQuery, r: Registry): View | null {
  if (!scope) return null;
  const known = (a: string) => r.accounts.some((x) => x.id === a);
  if (scope.kind === "client") {
    if (q.account && q.account !== scope.account) return null;
    return { mode: "client", account: scope.account };
  }
  if (q.view === "client") return q.account && shareable(r, q.account) ? { mode: "client", account: q.account } : null;
  const account = q.account && q.account !== "all" ? q.account : "all";
  return account === "all" || known(account) ? { mode: "owner", account } : null;
}

// ---------- snapshot ----------

export type ProbeStatus = "ok" | "degraded" | "down" | "no-probe";
export type Probe = { id: string; label: string; status: ProbeStatus; detail: string };
export type StationEvent = { at: string; dept: string; desk: string; job?: string; account: string; level: "info" | "ok" | "fail" | "warn"; message: string; source?: string };
export type FunnelDay = { day: string } & Record<string, number | string>;
export type NeedsYou = { kind: "job" | "probe" | "gate"; title: string; detail: string; dept?: string };

export type GateView = {
  id: string; label: string; detail: string; reviewer: string; reviewerDept: string;
  waiting: number | null; oldestAt?: string; readAt?: string; overdue: boolean; slaHours: number; nextReviewAt: string | null;
};
export type DeptView = {
  id: string; no: string; name: string;
  desks: { id: string; name: string; agent?: string; state: DeskState; since?: string; nextAt?: string | null }[];
  jobs: JobView[]; idle: number; noReadPath: number;
};
export type Snapshot = {
  now: string;
  view: View;
  accounts: { id: string; label: string; kind: AccountKind }[];
  top: { working: number; queue: number; stuck: number; feedAt: string | null; source: string | null; live: boolean };
  gates: GateView[];
  departments: DeptView[];
  infra: Probe[] | null;
  funnel: { status: "ok" | "no-read-path" | "error"; days: FunnelDay[] };
  needsYou: NeedsYou[];
  log: StationEvent[];
};

export type SnapshotInput = {
  registry: Registry;
  view: View;
  runs: Record<string, Run[]>;
  events: StationEvent[];
  gates: Record<string, GateReading>; // key: "<gate>:<account>"
  probes: Probe[];
  funnel: FunnelDay[] | null | "error";
  now: Date;
};

const LIVE_MS = 15 * MIN;
const LOG_LIMIT = 50;

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const { registry: r, view, now } = input;
  const client = view.mode === "client";
  const inAccount = (a: string) => view.account === "all" || a === view.account;
  const depts = r.departments.filter((d) => !client || d.client);
  const deptIds = new Set(depts.map((d) => d.id));
  const deptOfDesk = new Map(r.departments.flatMap((d) => d.desks.map((k) => [k.id, d.id] as const)));

  const jobs = r.jobs
    .filter((j) => inAccount(j.account) && deptIds.has(deptOfDesk.get(j.desk)!))
    .map((j) => jobView(j, r, input.runs[j.id] ?? [], now));

  const departments: DeptView[] = depts.map((d) => {
    const mine = jobs.filter((j) => j.dept === d.id).sort((a, b) => RANK[a.state] - RANK[b.state] || (a.nextAt ?? "~").localeCompare(b.nextAt ?? "~"));
    const desks = d.desks.map((k) => {
      const state = deskState(k, mine);
      const lead = mine.find((j) => j.desk === k.id && (j.state === state || state === "idle"));
      return { id: k.id, name: k.name, agent: client ? undefined : k.agent, state, since: lead?.startedAt, nextAt: lead?.nextAt };
    });
    return { id: d.id, no: d.no, name: d.name, desks, jobs: mine, idle: desks.filter((k) => k.state === "idle").length, noReadPath: desks.filter((k) => k.state === "no-read").length };
  });

  const gates: GateView[] = r.gates
    .filter((g) => deptIds.has(deptOfDesk.get(g.reviewer)!))
    .map((g) => {
      const readings = Object.entries(input.gates).filter(([k]) => k.startsWith(`${g.id}:`) && inAccount(k.slice(g.id.length + 1))).map(([, v]) => v);
      const waiting = readings.length ? readings.reduce((s, x) => s + x.waiting, 0) : null;
      const oldestAt = readings.map((x) => x.oldestAt).filter((x): x is string => !!x).sort()[0];
      const readAt = readings.map((x) => x.at).sort().at(-1);
      const reviewer = r.departments.flatMap((d) => d.desks).find((k) => k.id === g.reviewer)!;
      const job = g.job ? r.jobs.find((j) => j.id === g.job) : undefined;
      const reviewJob = job ? jobView(job, r, input.runs[job.id] ?? [], now) : undefined;
      const overdue = !!(waiting && oldestAt && now.getTime() - Date.parse(oldestAt) > g.slaHours * 3600_000);
      return {
        id: g.id, label: g.label, detail: g.detail, reviewer: reviewer.name, reviewerDept: deptOfDesk.get(g.reviewer)!,
        waiting, oldestAt, readAt, overdue, slaHours: g.slaHours, nextReviewAt: reviewJob?.nextAt ?? null,
      };
    });

  const events = input.events
    .filter((e) => inAccount(e.account) && deptIds.has(e.dept))
    .map((e) => (client ? { ...e, source: undefined } : e));
  const probes = client ? null : input.probes;

  const needsYou: NeedsYou[] = [
    ...jobs.filter((j) => j.state === "stuck").map((j) => ({ kind: "job" as const, title: `${j.deskName}: ${j.id} ${j.reason?.startsWith("started") ? "hung" : "failing"}`, detail: j.reason ?? "", dept: j.dept })),
    ...(probes ?? []).filter((p) => p.status === "degraded" || p.status === "down").map((p) => ({ kind: "probe" as const, title: `${p.label} ${p.status}`, detail: p.detail })),
    ...gates.filter((g) => g.overdue).map((g) => ({
      kind: "gate" as const, title: `${g.label} gate over its ${g.slaHours}h review window`, detail: `${g.waiting} waiting, oldest ${ago(Date.parse(g.oldestAt!), now)}`, dept: g.reviewerDept,
    })),
  ];

  const feed = events[0];
  const account = view.account === "all" ? null : r.accounts.find((a) => a.id === view.account);
  const funnelSource = view.account === "all" ? "site" : account?.funnel ?? null;
  return {
    now: now.toISOString(),
    view,
    accounts: client ? r.accounts.filter((a) => a.id === view.account).map(({ id, label, kind }) => ({ id, label, kind })) : r.accounts.map(({ id, label, kind }) => ({ id, label, kind })),
    top: {
      working: jobs.filter((j) => j.state === "running").length,
      queue: gates.reduce((s, g) => s + (g.waiting ?? 0), 0) + jobs.filter((j) => j.state === "due").length,
      stuck: jobs.filter((j) => j.state === "stuck").length,
      feedAt: feed?.at ?? null,
      source: client ? null : feed?.source ?? null,
      live: !!feed && now.getTime() - Date.parse(feed.at) < LIVE_MS,
    },
    gates,
    departments,
    infra: probes,
    funnel: funnelSource !== "site" ? { status: "no-read-path", days: [] } : input.funnel === "error" ? { status: "error", days: [] } : { status: input.funnel ? "ok" : "no-read-path", days: input.funnel ?? [] },
    needsYou,
    log: events.slice(0, LOG_LIMIT),
  };
}

/** The log line a beat leaves behind. */
export function eventFor(beat: Beat, r: Registry, now: Date): StationEvent {
  const at = now.toISOString();
  if (beat.kind === "gate") {
    const g = r.gates.find((x) => x.id === beat.gate)!;
    const dept = r.departments.find((d) => d.desks.some((k) => k.id === g.reviewer))!;
    return { at, dept: dept.id, desk: g.reviewer, account: beat.account, level: "info", message: `${g.label.toLowerCase()} gate: ${beat.waiting} waiting`, source: beat.source };
  }
  const job = r.jobs.find((j) => j.id === beat.jobId)!;
  const dept = r.departments.find((d) => d.desks.some((k) => k.id === job.desk))!;
  const tail = beat.message ? `: ${beat.message}` : "";
  const base = { at, dept: dept.id, desk: job.desk, job: job.id, account: job.account, source: beat.source };
  if (beat.state === "start") return { ...base, level: "info", message: `running ${job.id}${tail}` };
  if (beat.state === "ok") return { ...base, level: "ok", message: `${job.id} ok${tail}` };
  return { ...base, level: "fail", message: `${job.id} failed (exit ${beat.exitCode ?? 1})${tail}` };
}
