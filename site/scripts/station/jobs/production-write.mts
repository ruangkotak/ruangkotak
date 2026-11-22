// Scriptwriter, every 5 minutes: write the script and storyboard for a brand job whose brief is on KNOX.
//
// Alan pastes the brief on the Clients tab and presses Write script. KNOX keeps it until this job collects it
// (/api/station/production?pending=1, owner key), runs Claude Code here in print mode with read-only tools, and posts
// the answer back to the same card. Nothing is written to the notes folder and nothing is sent to the client.
// Alan's voice principles (~/.claude/voice-principles.md) go into the prompt when the file exists.
//
// Off until STATION_AGENTS=1 (same switch as agent-work): every run uses your Claude plan. One job per run.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { splitWritten, writerPrompt } from "../../../lib/production.ts";
import type { JobContext, JobResult } from "../client.mts";
import { claudeArgs, runClaude, unavailable as agentsUnavailable } from "./agent-work.mts";

export const requires = ["STATION_URL", "STATION_KEY"];
export const unavailable = agentsUnavailable;

const SYSTEM = [
  "You are the scriptwriter for RUANGKOTAK, writing for Alan (@alanazizreview).",
  "You write drafts only: Alan checks and edits every word before the brand sees it.",
  "Your opinions never stand in for his. Specs come from the brief or are marked [TO CONFIRM].",
].join(" ");

type Pending = { key: string; brand: string; what: string; deal: string; brief: string; clientNote?: string };

export default async function run(ctx: JobContext): Promise<JobResult> {
  const url = new URL("/api/station/production", ctx.env.STATION_URL);
  const headers = { "content-type": "application/json", "x-station-key": ctx.env.STATION_KEY ?? "" };
  try {
    const res = await fetch(new URL("?pending=1", url), { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, message: `KNOX answered ${res.status}` };
    const { pending } = (await res.json()) as { pending: Pending[] };
    if (!pending.length) return { ok: true, message: "no script waiting to be written" };
    const job = pending[0];
    const voiceFile = join(homedir(), ".claude", "voice-principles.md");
    const voice = existsSync(voiceFile) ? readFileSync(voiceFile, "utf8") : "";
    const r = await runClaude(claudeArgs(writerPrompt(job, job.deal, voice), SYSTEM), ctx.repo);
    const answer = r.ok ? { ...splitWritten(r.text) } : { failed: r.reason };
    const back = await fetch(url, { method: "POST", headers, body: JSON.stringify({ action: "written", key: job.key, ...answer }), signal: AbortSignal.timeout(15_000) });
    if (!back.ok) return { ok: false, message: `script written but KNOX answered ${back.status}` };
    const left = pending.length - 1;
    return r.ok
      ? { ok: true, message: `1 script written${left ? ` · ${left} more waiting` : ""}` }
      : { ok: true, message: `script failed: ${r.reason}${left ? ` · ${left} more waiting` : ""}`, attention: `Script for a brand job failed: ${r.reason}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
