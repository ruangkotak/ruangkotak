// Router, every 5 minutes: the Preview / Approve / Reject buttons on KNOX's Needs me tab.
// KNOX cannot reach the notes folder, so a press is only remembered there. This job (1) writes each waiting decision
// into the draft's **Status:** line (APPROVED or REJECTED), (2) sends KNOX the drafts still waiting so the owner can read
// them, (3) tells KNOX the decisions are written, and (4) re-reads the board so the Review and Post counts are current.
// The draft text goes up for the owner only (the one deliberate exception to "counts, not names"). Approving marks a
// draft ready; nothing is ever posted from here.
//
// Agent drafts (what a desk's agent wrote for one of the owner's asks) ride the same buttons. They are listed from
// <vault>/Station/drafts-queue.md with their text from Station/Drafts. A decision ticks the draft's line(s) in the
// queue with "approved in KNOX" or "rejected in KNOX", and ticks the ask in Asks.md, because the ask is now answered.
// The draft file itself is never changed or deleted.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beat, type JobContext, type JobResult } from "../client.mts";
import { AGENT_DRAFT, DRAFT_FILE, DRAFT_LIST_MAX, DRAFT_PREVIEW_MAX, type DraftDecision, type DraftView } from "../../../lib/station.ts";
import { checklistItem, myt, readQueue, stationFolder, tickLine } from "../queue.mts";
import { labelOf } from "./final-check.mts";
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

/** Pure: the agent drafts still waiting in drafts-queue.md, one per ask (a retried ask has several lines), newest first. */
export function agentDrafts(queueText: string, read: (link: string) => string | null): DraftView[] {
  const byId = new Map<string, DraftView>();
  for (const line of queueText.split("\n")) {
    const item = checklistItem(line);
    const id = item?.marker?.id, at = item?.marker?.at;
    if (!item || item.ticked || !id || !at || !AGENT_DRAFT.test(`agent/${id}`)) continue;
    const link = /\[\[(Drafts\/[^\]|#]+)\]\]/.exec(line)?.[1];
    if (!link || link.includes("..")) continue;
    const text = read(link);
    if (text === null) continue;
    const title = labelOf(line.replace(/ → \[\[[^\]]*\]\].*$/, ""));
    // The newest line for an ask wins: it points at the latest version of the draft.
    byId.set(id, { file: `agent/${id}`, kind: "agent", day: myt(at).slice(0, 10), title, client: title.split(":")[0], status: "DRAFT", preview: text.slice(0, DRAFT_PREVIEW_MAX), changedAt: at, where: `Station/${link}.md` });
  }
  return [...byId.values()].sort((x, y) => y.changedAt.localeCompare(x.changedAt));
}

/** Pure: both files after a decision on an agent draft. Every waiting line for that ask is ticked, and so is the ask. */
export function applyAgentDecision(queueText: string, asksText: string, id: string, decision: DraftDecision, at: string) {
  const note = `${decision === "approve" ? "approved" : "rejected"} in KNOX ${myt(at)}`;
  const queue = tickLine(queueText, id, note);
  return { queue, asks: tickLine(asksText, id, decision === "approve" ? `draft ${note}` : `draft ${note}, ask again with more detail`), changed: queue !== queueText };
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
    const folder = stationFolder(ctx.env, ctx.stateDir);
    const queueFile = join(folder, "drafts-queue.md"), asksFile = join(folder, "Asks.md");
    const slurp = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
    let agentDecided = false;
    for (const d of decisions) {
      if (AGENT_DRAFT.test(d.file)) {
        const before = slurp(queueFile), asks = slurp(asksFile);
        const r = applyAgentDecision(before, asks, d.file.slice("agent/".length), d.decision, d.at);
        if (r.changed) {
          writeFileSync(queueFile, r.queue);
          if (r.asks !== asks) writeFileSync(asksFile, r.asks);
          written++;
          agentDecided = true;
        } else skipped++;
        handled.push(d.file);
        continue;
      }
      if (!DRAFT_FILE.test(d.file)) continue; // never leave content/, whatever came down
      const path = join(dir, d.file);
      const next = existsSync(path) ? applyDecision(readFileSync(path, "utf8"), d.decision) : null;
      if (next === null) skipped++;
      else (writeFileSync(path, next), written++);
      handled.push(d.file);
    }

    // What is still waiting for review, newest first, for the owner to read on the board.
    const posts = readDrafts(dir)
      .filter((p) => !WAITING.has(p.status))
      .sort((a, b) => b.day.localeCompare(a.day))
      .map((p) => ({ file: p.file, day: p.day, title: p.title, client: p.client, status: p.status, preview: p.text.slice(0, DRAFT_PREVIEW_MAX), changedAt: p.changedAt }));
    // Agent drafts first: they answer something the owner just asked for.
    const agents = agentDrafts(slurp(queueFile), (link) => { const path = join(folder, `${link}.md`); return existsSync(path) ? readFileSync(path, "utf8") : null; });
    const drafts = [...agents, ...posts].slice(0, DRAFT_LIST_MAX);
    const up = await fetch(url, { method: "POST", headers, body: JSON.stringify({ drafts }), signal: AbortSignal.timeout(15_000) });
    if (!up.ok) return { ok: false, message: `wrote ${written}, but KNOX refused the draft list (${up.status})` };

    if (handled.length) {
      const ack = await fetch(url, { method: "POST", headers, body: JSON.stringify({ ack: handled }), signal: AbortSignal.timeout(15_000) });
      if (!ack.ok) return { ok: false, message: `wrote ${written}, but KNOX refused the confirmation (${ack.status})` };
      // A decision changes the Review and Post counts: report them now instead of waiting for 09:00.
      for (const g of review(readBoard(dir), mytDay(ctx.now)).gates ?? []) await beat(ctx.env, g);
    }
    // An agent draft decided here changes the Drafts count: report it with this run.
    const gates = agentDecided ? [{ gate: "drafts", ...readQueue(slurp(queueFile)) }] : undefined;
    return { ok: true, gates, message: `${drafts.length} draft${drafts.length === 1 ? "" : "s"} on the board${handled.length ? ` · ${written} decision${written === 1 ? "" : "s"} written${skipped ? `, ${skipped} skipped` : ""}` : ""}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
