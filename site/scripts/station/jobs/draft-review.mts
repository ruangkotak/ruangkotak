// Router, every 5 minutes: the Preview / Approve / Reject buttons on KNOX's Needs me tab.
// KNOX cannot reach the notes folder, so a press is only remembered there. This job (1) writes each waiting decision
// into the draft's **Status:** line (APPROVED or REJECTED), (2) sends KNOX the drafts still waiting so the owner can read
// them, (3) tells KNOX the decisions are written, and (4) re-reads the board so the Review and Post counts are current.
// The draft text goes up for the owner only (the one deliberate exception to "counts, not names"). Approving marks a
// draft ready; nothing is ever posted from here.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beat, type JobContext, type JobResult } from "../client.mts";
import { DRAFT_FILE, DRAFT_LIST_MAX, DRAFT_PREVIEW_MAX, type DraftDecision } from "../../../lib/station.ts";
import { contentDir, readBoard, readDrafts, review, setStatus, statusOf, unavailable as noContent } from "./board-completeness.mts";
import { mytDay } from "./reminder-check.mts";

export const unavailable = noContent;

const LIVE = new Set(["PUBLISHED", "POSTED", "LIVE"]);
const WAITING = new Set(["APPROVED", "READY", "SCHEDULED", "PUBLISHED", "POSTED", "LIVE", "REJECTED", "DROPPED", "TESTED"]);

export type Decision = { file: string; decision: DraftDecision; at: string };

/** Pure: the file text after a decision, or null when it should be left alone (no status line, or already out in the world). */
export function applyDecision(text: string, decision: DraftDecision): string | null {
  if (LIVE.has(statusOf(text))) return null;
  return setStatus(text, decision === "approve" ? "APPROVED" : "REJECTED");
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const url = new URL("/api/station/drafts", ctx.env.STATION_URL);
  const headers = { "content-type": "application/json", "x-station-key": ctx.env.STATION_KEY ?? "" };
  const dir = contentDir(ctx);
  try {
    const res = await fetch(`${url}?pending=1`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, message: `drafts endpoint answered ${res.status}` };
    const { decisions } = (await res.json()) as { decisions: Decision[] };

    const handled: string[] = [];
    let written = 0;
    let skipped = 0;
    for (const d of decisions) {
      if (!DRAFT_FILE.test(d.file)) continue; // never leave content/, whatever came down
      const path = join(dir, d.file);
      const next = existsSync(path) ? applyDecision(readFileSync(path, "utf8"), d.decision) : null;
      if (next === null) skipped++;
      else (writeFileSync(path, next), written++);
      handled.push(d.file);
    }

    // What is still waiting for review, newest first, for the owner to read on the board.
    const drafts = readDrafts(dir)
      .filter((p) => !WAITING.has(p.status))
      .sort((a, b) => b.day.localeCompare(a.day))
      .slice(0, DRAFT_LIST_MAX)
      .map((p) => ({ file: p.file, day: p.day, title: p.title, client: p.client, status: p.status, preview: p.text.slice(0, DRAFT_PREVIEW_MAX), changedAt: p.changedAt }));
    const up = await fetch(url, { method: "POST", headers, body: JSON.stringify({ drafts }), signal: AbortSignal.timeout(15_000) });
    if (!up.ok) return { ok: false, message: `wrote ${written}, but KNOX refused the draft list (${up.status})` };

    if (handled.length) {
      const ack = await fetch(url, { method: "POST", headers, body: JSON.stringify({ ack: handled }), signal: AbortSignal.timeout(15_000) });
      if (!ack.ok) return { ok: false, message: `wrote ${written}, but KNOX refused the confirmation (${ack.status})` };
      // A decision changes the Review and Post counts: report them now instead of waiting for 09:00.
      for (const g of review(readBoard(dir), mytDay(ctx.now)).gates ?? []) await beat(ctx.env, g);
    }
    return { ok: true, message: `${drafts.length} draft${drafts.length === 1 ? "" : "s"} on the board${handled.length ? ` · ${written} decision${written === 1 ? "" : "s"} written${skipped ? `, ${skipped} skipped` : ""}` : ""}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
