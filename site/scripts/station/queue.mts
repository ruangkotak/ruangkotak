// Checklists that Station counts: one line per item, ticked by hand once handled. Used by the DM queue
// (ig-comment-dm) and the brief queue (brief-sweep). Each line ends with a hidden marker holding the item's id and
// time, so the count survives any edit to the visible text. Station only ever gets the unticked count and the oldest time.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Env } from "./client.mts";

/** Where checklists and the digest live: <vault>/Station when a vault is set, else the scheduler's state folder. */
export const stationFolder = (env: Env, stateDir: string) => (env.STATION_VAULT_DIR ? join(env.STATION_VAULT_DIR, "Station") : stateDir);

export const clean = (s: string) => s.replace(/<!--|-->/g, "").replace(/\s+/g, " ").trim();
export const myt = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

export function checklistLine(id: string, at: string, text: string) {
  return `- [ ] ${myt(at)} · ${clean(text)} <!-- rk:id=${clean(id).replace(/\s/g, "_")} at=${at} -->`;
}

/** Unticked entries and the oldest one's time. Entries you delete or tick no longer count. */
export function readQueue(text: string): { waiting: number; oldestAt?: string } {
  let waiting = 0;
  let oldestAt: string | undefined;
  for (const line of text.split("\n")) {
    const m = /^\s*- \[( |x|X)\] .*<!-- rk:id=\S+ at=(\S+) -->\s*$/.exec(line);
    if (!m || m[1] !== " ") continue;
    waiting++;
    if (!oldestAt || m[2] < oldestAt) oldestAt = m[2];
  }
  return { waiting, oldestAt };
}

export function readQueueFile(path: string) {
  return existsSync(path) ? readQueue(readFileSync(path, "utf8")) : { waiting: 0 };
}

/** Appends lines (oldest first), writing the header if the file is new. */
export function appendToQueue(path: string, header: string, lines: string[]) {
  if (!lines.length) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, (existsSync(path) ? "" : `${header}\n\n`) + lines.join("\n") + "\n");
}

/** Every checklist in the Station folder, for the digest. */
export function allQueues(folder: string) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => /-queue(-[a-z0-9._-]+)?\.md$/.test(f))
    .sort()
    .map((f) => ({ file: f, ...readQueueFile(join(folder, f)) }));
}
