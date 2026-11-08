// Platform Engineer, every 15 minutes: is this clone in step with GitHub?
// Fails only when git itself fails (no network to GitHub, broken repo). Being behind or having edits is reported, not failed:
// backup-freshness-guard decides when local-only work has waited too long.
import { git, type JobContext, type JobResult } from "../client.mts";

export function describe(branch: string, ahead: number, behind: number, changed: number) {
  const sync = ahead || behind ? [ahead && `${ahead} ahead`, behind && `${behind} behind`].filter(Boolean).join(", ") : "in sync";
  return `${branch} · ${sync} · ${changed ? `${changed} changed file${changed > 1 ? "s" : ""}` : "clean"}`;
}

export default async function run({ repo }: JobContext): Promise<JobResult> {
  try {
    await git(["fetch", "--quiet", "--prune", "origin"], repo);
    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], repo)).trim();
    let ahead = 0, behind = 0;
    try {
      const counts = (await git(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], repo)).trim().split(/\s+/).map(Number);
      [behind, ahead] = counts;
    } catch {
      return { ok: true, message: `${branch} · no upstream branch` };
    }
    const changed = (await git(["status", "--porcelain"], repo)).split("\n").filter(Boolean).length;
    return { ok: true, message: describe(branch, ahead, behind, changed) };
  } catch (err) {
    return { ok: false, message: `git: ${(err as Error).message}` };
  }
}
