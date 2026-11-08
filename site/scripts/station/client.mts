// Shared by the Station laptop scripts: where settings live, how they are read, how a beat is sent.
// Settings come from ~/.config/ruangkotak/station.env (written by station-install.mts, mode 600), and the real
// environment wins over the file. The key never goes into a launchd plist, a crontab or the repo.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

export type JobResult = { ok: boolean; message: string };
export type JobContext = { env: Env; repo: string; now: Date };
