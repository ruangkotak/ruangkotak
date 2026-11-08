// Shared by the Station laptop scripts: where settings live, how they are read, how a beat is sent.
// Settings come from ~/.config/ruangkotak/station.env (written by station-install.mts, mode 600), and the real
// environment wins over the file. The key never goes into a launchd plist, a crontab or the repo.
import { execFile } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONFIG_DIR = join(homedir(), ".config", "ruangkotak");
export const ENV_FILE = join(CONFIG_DIR, "station.env");
export const STATE_DIR = join(homedir(), ".local", "state", "ruangkotak-station");
export const SITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REPO_DIR = resolve(SITE_DIR, "..");
export const DEFAULT_URL = "https://ruangkotak.com";

export type Env = Record<string, string | undefined>;

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

export function loadEnv(): Env {
  const file = existsSync(ENV_FILE) ? parseEnvFile(readFileSync(ENV_FILE, "utf8")) : {};
  return { STATION_URL: DEFAULT_URL, STATION_SOURCE: "laptop", ...file, ...process.env };
}

/** Changes one setting in station.env (mode 600), keeping every other line. Used to store a refreshed token. */
export function setEnvValue(key: string, value: string) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n") : [];
  const at = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  if (at >= 0) lines[at] = `${key}=${value}`;
  else lines.splice(lines.length && lines.at(-1) === "" ? lines.length - 1 : lines.length, 0, `${key}=${value}`);
  writeFileSync(ENV_FILE, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600);
}

/** Sends one beat. Never throws: a beat that cannot be delivered is logged and the job carries on. */
export async function beat(env: Env, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(new URL("/api/station/beat", env.STATION_URL), {
      method: "POST",
      headers: { "content-type": "application/json", "x-station-key": env.STATION_KEY ?? "" },
      body: JSON.stringify({ source: env.STATION_SOURCE, ...body }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error(`[station] beat refused: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.ok;
  } catch (err) {
    console.error(`[station] beat not delivered: ${(err as Error).message}`);
    return false;
  }
}

/** Runs git in the repo and returns stdout. Rejects with git's own error text. */
export function git(args: string[], cwd = REPO_DIR, timeout = 60_000): Promise<string> {
  return new Promise((done, fail) =>
    execFile("git", args, { cwd, timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? fail(new Error((stderr || err.message).trim().split("\n")[0])) : done(stdout),
    ),
  );
}

/** A gate reading a job wants sent with its result (for the job's own account). Counts only, never names. */
export type GateUpdate = { gate: string; waiting: number; oldestAt?: string };
/** `attention`: a short, count-only line for Station's Needs you, sent with a successful run (no names, no task text). */
export type JobResult = { ok: boolean; message: string; attention?: string; gates?: GateUpdate[] };
export type JobAccount = { id: string; label: string; instagram?: string };
export type JobContext = {
  env: Env; repo: string; now: Date; job: { id: string; account: string }; account: JobAccount; stateDir: string;
  registry: { departments: { id: string; desks: { id: string; name: string }[] }[] };
};
