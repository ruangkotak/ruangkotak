// Security Officer, nightly at 03:00: has a secret slipped into the repo?
// Checks every git-tracked file for env files, well-known token shapes, and the exact values held in this laptop's
// own env files (station.env, site/.env*). Reports file names and the kind of secret, never the secret itself.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ENV_FILE, git, parseEnvFile, type JobContext, type JobResult } from "../client.mts";

const SHAPES: [string, RegExp][] = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Resend key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/],
  ["Apify token", /\bapify_api_[A-Za-z0-9]{30,}\b/],
  ["Telegram bot token", /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/],
  ["OpenAI/Anthropic-style key", /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/],
  ["Slack token", /\bxox[abpr]-[A-Za-z0-9-]{20,}\b/],
];
const SKIP = /(^|\/)(package-lock\.json|.*\.(png|jpe?g|gif|webp|ico|mp4|mov|wav|mp3|woff2?|ttf|otf|pdf|zip))$/i;
const ENV_PATH = /(^|\/)\.env(\.[^/]*)?$/;

/** Pure scan of one file's text. `known` maps a secret value to the variable name it came from. */
export function findSecrets(path: string, text: string, known: Map<string, string>): string[] {
  const hits: string[] = [];
  if (ENV_PATH.test(path) && !path.endsWith(".env.example")) hits.push(`${path}: env file is tracked`);
  for (const [name, re] of SHAPES) if (re.test(text)) hits.push(`${path}: ${name}`);
  for (const [value, name] of known) if (text.includes(value)) hits.push(`${path}: value of ${name}`);
  return hits;
}

function knownValues(repo: string): Map<string, string> {
  const known = new Map<string, string>();
  for (const file of [ENV_FILE, join(repo, ".env"), join(repo, "site", ".env"), join(repo, "site", ".env.local"), join(repo, "site", ".env.production")]) {
    if (!existsSync(file)) continue;
    for (const [k, v] of Object.entries(parseEnvFile(readFileSync(file, "utf8"))))
      // Long values only, and not settings that are plainly not secret: URLs, folders, flags, numbers.
      if (v.length >= 12 && !/^https?:\/\//.test(v) && !/^[~/]/.test(v) && !/^(true|false|\d+)$/.test(v)) known.set(v, k);
  }
  return known;
}

export default async function run({ repo }: JobContext): Promise<JobResult> {
  try {
    const files = (await git(["ls-files", "-z"], repo)).split("\0").filter(Boolean);
    const known = knownValues(repo);
    const hits: string[] = [];
    let scanned = 0;
    for (const path of files) {
      if (SKIP.test(path)) continue;
      const full = join(repo, path);
      let text: string;
      try {
        if (statSync(full).size > 2_000_000) continue;
        text = readFileSync(full, "utf8");
      } catch {
        continue; // deleted in the working tree
      }
      if (text.includes("\0")) continue; // binary
      scanned++;
      hits.push(...findSecrets(path, text, known));
    }
    if (hits.length) return { ok: false, message: `${hits.length} finding${hits.length > 1 ? "s" : ""}: ${hits.slice(0, 3).join("; ")}${hits.length > 3 ? " …" : ""}` };
    return { ok: true, message: `${scanned} tracked files clean (${known.size} local secrets checked)` };
  } catch (err) {
    return { ok: false, message: `git: ${(err as Error).message}` };
  }
}
