// The laptop side of Station. Run every minute by launchd (macOS) or cron (Linux); see station-install.mts.
// Each tick reads data/station/registry.json, picks the jobs that have a script in scripts/station/jobs/ (the job's
// "script" name, else its id) and are due,
// runs them side by side, and reports each one to Station (start, then ok/fail with a one-line message).
//
//   node --experimental-strip-types scripts/station-tick.mts            one tick (what launchd runs)
//   node --experimental-strip-types scripts/station-tick.mts --list     laptop jobs, what they need, when they are due
//   node --experimental-strip-types scripts/station-tick.mts --run <id> run one job now, whatever its schedule
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDue, parseSchedule, type Job, type Registry, type TickEntry } from "../lib/station.ts";
import { beat, loadEnv, REPO_DIR, SITE_DIR, STATE_DIR, type JobContext, type JobResult } from "./station/client.mts";

const JOBS_DIR = join(SITE_DIR, "scripts", "station", "jobs");
const STATE_FILE = join(STATE_DIR, "state.json");
const LOCK = join(STATE_DIR, "tick.lock");
const JOB_TIMEOUT_MS = 10 * 60_000;

// A job module: its run function, the settings it needs, and optionally a reason it cannot run for a given job/account.
type JobModule = { default: (ctx: JobContext) => Promise<JobResult>; requires?: string[]; unavailable?: (ctx: JobContext) => string | null };

const env = loadEnv();
const registry = JSON.parse(readFileSync(join(SITE_DIR, "data", "station", "registry.json"), "utf8")) as Registry;
const scriptOf = (j: Job) => join(JOBS_DIR, `${j.script ?? j.id}.mts`);
const laptopJobs = registry.jobs.filter((j) => existsSync(scriptOf(j)));
const byId = new Map(registry.jobs.map((j) => [j.id, j]));
mkdirSync(STATE_DIR, { recursive: true });

const readState = (): Record<string, TickEntry> => {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
};
const writeState = (s: Record<string, TickEntry>) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
const load = async (id: string) => (await import(scriptOf(byId.get(id)!))) as JobModule;
const contextFor = (id: string): JobContext => {
  const job = byId.get(id)!;
  const a = registry.accounts.find((x) => x.id === job.account)!;
  return { env, repo: REPO_DIR, now: new Date(), job: { id, account: job.account }, account: { id: a.id, label: a.label, instagram: a.instagram }, stateDir: STATE_DIR };
};
/** Why a job cannot run here, or null when it can: a missing setting, or the job's own check (e.g. no Instagram handle). */
const blocked = (id: string, mod: JobModule) => {
  const need = (mod.requires ?? []).filter((k) => !env[k]);
  return need.length ? `set ${need.join(", ")}` : mod.unavailable?.(contextFor(id)) ?? null;
};
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);

async function runJob(id: string): Promise<JobResult> {
  const mod = await load(id);
  const ctx = contextFor(id);
  await beat(env, { jobId: id, state: "start" });
  let result: JobResult;
  try {
    result = await Promise.race([
      mod.default(ctx),
      new Promise<JobResult>((done) => setTimeout(() => done({ ok: false, message: `timed out after ${JOB_TIMEOUT_MS / 60_000} min` }), JOB_TIMEOUT_MS).unref()),
    ]);
  } catch (err) {
    result = { ok: false, message: `crashed: ${(err as Error).message}` };
  }
  for (const g of result.gates ?? []) await beat(env, { ...g, account: ctx.job.account });
  await beat(env, result.ok ? { jobId: id, state: "ok", message: result.message } : { jobId: id, state: "fail", exitCode: 1, message: result.message });
  console.log(`${stamp()} ${id}: ${result.ok ? "ok" : "FAIL"} · ${result.message}`);
  return result;
}

if (!env.STATION_KEY) {
  console.error("No STATION_KEY: run station-install.mts first, or set it in the environment.");
  process.exit(2);
}

const args = process.argv.slice(2);

if (args[0] === "--list") {
  const state = readState();
  const now = new Date();
  console.log(`Station: ${env.STATION_URL} · source "${env.STATION_SOURCE}" · state ${STATE_FILE}\n`);
  for (const j of laptopJobs) {
    const why = blocked(j.id, await load(j.id));
    const e = state[j.id] ?? {};
    const when = why ? `skipped: ${why}` : isDue(parseSchedule(j.schedule)!, e, now) ? "due now" : "waiting";
    console.log(`${j.id.padEnd(24)} ${j.schedule.padEnd(14)} ${when}${e.lastStart ? ` · last start ${e.lastStart}` : ""}`);
  }
  const off = registry.jobs.filter((j) => !laptopJobs.includes(j)).map((j) => j.id);
  if (off.length) console.log(`\nNot run from this laptop (no script yet): ${off.join(", ")}`);
  process.exit(0);
}

if (args[0] === "--run") {
  const id = args[1];
  if (!laptopJobs.some((j) => j.id === id)) {
    console.error(`No laptop job "${id}". Laptop jobs: ${laptopJobs.map((j) => j.id).join(", ")}`);
    process.exit(2);
  }
  const why = blocked(id, await load(id));
  if (why) {
    console.error(`${id} cannot run here: ${why}`);
    process.exit(2);
  }
  const state = readState();
  state[id] = { ...state[id], lastStart: new Date().toISOString() };
  writeState(state);
  process.exit((await runJob(id)).ok ? 0 : 1);
}

// A normal tick. One at a time: a lock older than 30 minutes, or held by a process that is gone, is stale.
if (existsSync(LOCK)) {
  const [pid, at] = readFileSync(LOCK, "utf8").split(" ");
  let alive = false;
  try {
    process.kill(Number(pid), 0);
    alive = true;
  } catch {}
  if (alive && Date.now() - Date.parse(at) < 30 * 60_000) process.exit(0);
}
writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()}`);
try {
  const now = new Date();
  const state = readState();
  const due: string[] = [];
  for (const j of laptopJobs) {
    const schedule = parseSchedule(j.schedule);
    if (!schedule || blocked(j.id, await load(j.id))) continue;
    const e = state[j.id] ?? {};
    if (isDue(schedule, e, now)) {
      due.push(j.id);
      e.lastStart = now.toISOString();
    }
    e.lastCheck = now.toISOString();
    state[j.id] = e;
  }
  writeState(state); // before running, so a crash mid-job never makes the next tick re-run it in a loop
  await Promise.all(due.map(runJob));
} finally {
  rmSync(LOCK, { force: true });
}
