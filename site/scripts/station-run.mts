// Runs any command and reports it to Station: a "start" beat, then "ok" or "fail" with the exit code.
// Use it for jobs that are not in scripts/station/jobs/, such as a cron entry or a script that lives elsewhere.
//
//   node --experimental-strip-types scripts/station-run.mts <jobId> -- <command> [args…]
//   node --experimental-strip-types scripts/station-run.mts --gate report --waiting 3 [--oldest <ISO>] [--account client-demo]
//
// The key and URL come from ~/.config/ruangkotak/station.env (see station-install.mts) or the environment
// (STATION_KEY, STATION_URL, STATION_SOURCE). The command's exit code is passed through, so cron/launchd still see failures.
import { spawn } from "node:child_process";
import { beat, loadEnv } from "./station/client.mts";

const env = loadEnv();
if (!env.STATION_KEY) {
  console.error("STATION_KEY is not set: run station-install.mts, or export it");
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag("gate")) {
  await beat(env, { gate: flag("gate"), waiting: Number(flag("waiting") ?? 0), oldestAt: flag("oldest"), account: flag("account") });
  process.exit(0);
}

const [jobId, sep, cmd, ...rest] = args;
if (!jobId || sep !== "--" || !cmd) {
  console.error("usage: station-run.mts <jobId> -- <command> [args…]");
  process.exit(2);
}

await beat(env, { jobId, state: "start" });
const code: number = await new Promise((done) => {
  const child = spawn(cmd, rest, { stdio: "inherit" });
  child.on("error", (err) => (console.error(err.message), done(127)));
  child.on("close", (c, signal) => done(c ?? (signal ? 128 : 1)));
});
await beat(env, code === 0 ? { jobId, state: "ok" } : { jobId, state: "fail", exitCode: code });
process.exit(code);
