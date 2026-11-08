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

/** The fields in a line's hidden marker (`<!-- rk:id=… at=… desk=… -->`), or null when it has none. */
export function markerOf(line: string): Record<string, string> | null {
  const m = /<!-- rk:([^>]*?) -->\s*$/.exec(line);
  if (!m) return null;
  return Object.fromEntries(m[1].trim().split(/\s+/).map((kv) => kv.split("=") as [string, string]).filter(([k, v]) => k && v !== undefined));
}

/** A checklist line: its tick state and its marker, if any. Anything else in the file is left alone. */
export function checklistItem(line: string): { ticked: boolean; marker: Record<string, string> | null } | null {
  const m = /^\s*[-*] \[( |x|X)\] /.exec(line);
  return m ? { ticked: m[1] !== " ", marker: markerOf(line) } : null;
}

/** Unticked entries and the oldest one's time. Entries you delete or tick no longer count. */
export function readQueue(text: string): { waiting: number; oldestAt?: string } {
  let waiting = 0;
  let oldestAt: string | undefined;
  for (const line of text.split("\n")) {
    const item = checklistItem(line);
    if (!item || item.ticked || !item.marker?.id || !item.marker.at) continue;
    waiting++;
    if (!oldestAt || item.marker.at < oldestAt) oldestAt = item.marker.at;
  }
  return { waiting, oldestAt };
}

/**
 * Gives every unticked line typed by hand a marker, so it gets an id and a "waiting since" time. `extra` can add
 * fields and change the visible text (e.g. the router adds the desk). Returns the new text and the lines it marked.
 */
export function markNewLines(text: string, now: string, extra: (line: string) => { text?: string; fields?: Record<string, string> } = () => ({})) {
  const marked: string[] = [];
  let n = 0;
  const lines = text.split("\n").map((line) => {
    const item = checklistItem(line);
    if (!item || item.ticked || item.marker) return line;
    const { text: visible = line.trimEnd(), fields = {} } = extra(line);
    const id = `${now.replace(/\D/g, "").slice(0, 14)}-${++n}`;
    const out = `${visible} <!-- rk:id=${id} at=${now}${Object.entries(fields).map(([k, v]) => ` ${k}=${v}`).join("")} -->`;
    marked.push(out);
    return out;
  });
  return { text: lines.join("\n"), marked };
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

/** Ticks the line whose marker has this id and adds a note before the marker ("DM sent 10:02"). Unknown id: unchanged. */
export function tickLine(text: string, id: string, note: string) {
  return text
    .split("\n")
    .map((line) => {
      const item = checklistItem(line);
      if (!item || item.ticked || item.marker?.id !== id) return line;
      return line.replace(/^(\s*[-*] )\[ \]/, "$1[x]").replace(/ <!-- rk:/, ` · ${clean(note)} <!-- rk:`);
    })
    .join("\n");
}
