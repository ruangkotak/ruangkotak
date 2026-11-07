// Runs a command and reports it to Station: a "start" beat, then "ok" or "fail" with the exit code.
//
//   STATION_KEY=… node scripts/station-run.mts <jobId> -- <command> [args…]
//   STATION_KEY=… node scripts/station-run.mts --gate report --waiting 3 [--oldest 2026-11-07T01:00:00Z] [--account client-demo]
//
// STATION_URL defaults to https://ruangkotak.com (use http://127.0.0.1:3100 locally). STATION_SOURCE defaults to "laptop",
// which also keeps the Laptop tile green. The command's own exit code is passed through, so cron/launchd still see failures.
// A beat that cannot be delivered is printed and ignored: reporting never breaks the job itself.
import { spawn } from "node:child_process";

const { STATION_KEY, STATION_URL = "https://ruangkotak.com", STATION_SOURCE = "laptop" } = process.env;
if (!STATION_KEY) {
  console.error("STATION_KEY is not set");
  process.exit(2);
}

async function beat(body: Record<string, unknown>) {
  try {
    const res = await fetch(new URL("/api/station/beat", STATION_URL), {
      method: "POST",
      headers: { "content-type": "application/json", "x-station-key": STATION_KEY! },
      body: JSON.stringify({ source: STATION_SOURCE, ...body }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`[station] beat refused: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error(`[station] beat not delivered: ${(err as Error).message}`);
  }
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag("gate")) {
  await beat({ gate: flag("gate"), waiting: Number(flag("waiting") ?? 0), oldestAt: flag("oldest"), account: flag("account") });
  process.exit(0);
}

const [jobId, sep, cmd, ...rest] = args;
if (!jobId || sep !== "--" || !cmd) {
  console.error("usage: station-run.mts <jobId> -- <command> [args…]");
  process.exit(2);
}

await beat({ jobId, state: "start" });
const code: number = await new Promise((done) => {
  const child = spawn(cmd, rest, { stdio: "inherit" });
  child.on("error", (err) => (console.error(err.message), done(127)));
  child.on("close", (c, signal) => done(c ?? (signal ? 128 : 1)));
});
await beat(code === 0 ? { jobId, state: "ok" } : { jobId, state: "fail", exitCode: code });
process.exit(code);
