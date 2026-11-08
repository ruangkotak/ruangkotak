// Apify, as the site uses it (lib/source.ts): run an actor synchronously and return its dataset items.
// The laptop needs its own APIFY_TOKEN in station.env (station-install.mts --apify-token).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export async function apify<T>(token: string, actor: string, input: object): Promise<T[]> {
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=120`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(130_000),
  });
  if (!res.ok) throw new Error(`Apify ${actor.split("~")[1]} HTTP ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error(`Apify ${actor.split("~")[1]} returned no list`);
  return items as T[];
}

// ---------- reels ----------

/** One reel as the Station jobs keep it: link, publish time, plays. No captions, no covers. */
export type Reel = { url: string; at: string; views: number };
export type ReelSnapshot = { handle: string; at: string; reels: Reel[] };

type IgReel = { url?: string; timestamp?: string; videoPlayCount?: number; videoViewCount?: number };

export async function scrapeReels(token: string, handle: string, limit: number): Promise<Reel[]> {
  const items = await apify<IgReel>(token, "apify~instagram-reel-scraper", { username: [handle], resultsLimit: limit });
  return items
    .map((r) => ({ url: r.url ?? "", at: r.timestamp ?? "", views: r.videoPlayCount ?? r.videoViewCount ?? -1 }))
    .filter((r) => r.url && r.at && !Number.isNaN(Date.parse(r.at)) && r.views >= 0)
    .sort((a, b) => b.at.localeCompare(a.at));
}

// The newest snapshot per handle, shared by the velocity and comment jobs. Rates use each snapshot's own time,
// so it does not matter which job took the last one.
export const snapshotPath = (stateDir: string, handle: string) => join(stateDir, "ig", `${handle}.json`);

export function readSnapshot(stateDir: string, handle: string): ReelSnapshot | null {
  const p = snapshotPath(stateDir, handle);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ReelSnapshot;
  } catch {
    return null;
  }
}

export function writeSnapshot(stateDir: string, snap: ReelSnapshot) {
  const p = snapshotPath(stateDir, snap.handle);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(snap));
}

export const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`;
