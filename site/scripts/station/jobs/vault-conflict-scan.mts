// Librarian, every 30 minutes: has sync left conflict copies in the notes vault?
// Runs only when STATION_VAULT_DIR is set (station-install.mts --vault <folder>). Catches the file names that
// Dropbox, Syncthing, Obsidian Sync and similar tools give a losing copy.
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { JobContext, JobResult } from "../client.mts";

export const requires = ["STATION_VAULT_DIR"];

// Only unambiguous markers: "Note (1).md" or "Note 2.md" are too often real names to flag.
const CONFLICT = /(conflicted copy|sync-conflict-\d{8}|\((conflict|conflicted)[^)]*\)|\.conflict\b)/i;
const SKIP_DIRS = new Set([".git", ".trash", "node_modules"]);

export function isConflict(name: string) {
  return CONFLICT.test(name);
}

function walk(dir: string, out: string[], depth = 0) {
  if (depth > 12) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out, depth + 1);
    } else if (isConflict(e.name)) out.push(join(dir, e.name));
  }
}

export default async function run({ env }: JobContext): Promise<JobResult> {
  const root = env.STATION_VAULT_DIR!;
  try {
    const found: string[] = [];
    walk(root, found);
    if (!found.length) return { ok: true, message: "no conflict copies" };
    return { ok: false, message: `${found.length} conflict cop${found.length > 1 ? "ies" : "y"}: ${found.slice(0, 2).map((f) => relative(root, f)).join(", ")}${found.length > 2 ? " …" : ""}` };
  } catch (err) {
    return { ok: false, message: `cannot read vault: ${(err as Error).message}` };
  }
}
