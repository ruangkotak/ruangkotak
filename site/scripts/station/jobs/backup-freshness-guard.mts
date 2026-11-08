// Backup & Recovery, every 6 hours: is any work living only on this laptop for too long?
// Fails when a commit has sat unpushed, or a tracked file has sat uncommitted, for more than a day. A lost or dead
// laptop would take that work with it.
import { statSync } from "node:fs";
import { join } from "node:path";
import { git, type JobContext, type JobResult } from "../client.mts";

const MAX_HOURS = 24;

/** Pure verdict from the ages (epoch ms) of unpushed commits and uncommitted files. */
export function verdict(unpushed: number[], dirty: number[], now: number, maxHours = MAX_HOURS): JobResult {
  const age = (t: number) => Math.round((now - t) / 3600_000);
  const oldCommit = unpushed.length ? Math.min(...unpushed) : null;
  const oldEdit = dirty.length ? Math.min(...dirty) : null;
  const parts = [
    unpushed.length && `${unpushed.length} unpushed commit${unpushed.length > 1 ? "s" : ""} (oldest ${age(oldCommit!)}h)`,
    dirty.length && `${dirty.length} uncommitted file${dirty.length > 1 ? "s" : ""} (oldest ${age(oldEdit!)}h)`,
  ].filter(Boolean);
  if (!parts.length) return { ok: true, message: "everything is on GitHub" };
  const stale = [oldCommit, oldEdit].some((t) => t !== null && now - t > maxHours * 3600_000);
  return { ok: !stale, message: `${parts.join(", ")}${stale ? `: older than ${maxHours}h, push it` : ""}` };
}

export default async function run({ repo, now }: JobContext): Promise<JobResult> {
  try {
    // Commits on any local branch that no remote branch contains.
    const unpushed = (await git(["log", "--branches", "--not", "--remotes", "--format=%ct"], repo))
      .split("\n").filter(Boolean).map((s) => Number(s) * 1000);
    // Tracked files with edits, dated by their last change on disk (deleted files count as changed now).
    const dirty = (await git(["status", "--porcelain", "--untracked-files=no"], repo))
      .split("\n").filter(Boolean)
      .map((line) => line.slice(3).split(" -> ").at(-1)!)
      .map((path) => {
        try {
          return statSync(join(repo, path)).mtimeMs;
        } catch {
          return now.getTime();
        }
      });
    return verdict(unpushed, dirty, now.getTime());
  } catch (err) {
    return { ok: false, message: `git: ${(err as Error).message}` };
  }
}
