// CDO Reviewer, 18:00 weekdays, one job per client (client-demo-final-check, and any "<client>-final-check" sharing this
// script): which deliverables are waiting for final review?
// The checklist is <vault>/Station/final-queue-<account>.md (created on first run with instructions). Add a line per
// deliverable, by hand or by your editors: "- [ ] Reel 3 v2". Tick it once it has passed final review.
// Each new line is stamped with a hidden marker, so Station's Final gate knows how long it has waited (48h window).
// The client's own Station page shows each open line by name, and lists ticked ones as delivered.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { checklistItem, clean, markNewLines, readQueue, stationFolder } from "../queue.mts";

const H = 3600_000;
const KEEP_DELIVERED_DAYS = 30;

/** The visible name of a checklist line: no box, no marker, no "2026-11-08 09:00 ·" stamp. */
export const labelOf = (line: string) =>
  clean(line.replace(/^\s*[-*] \[[ xX]\] /, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} · /, "")).slice(0, 100);

/**
 * Pure: the open items (shown to the client by name) and what was delivered. A line counts as delivered the first run
 * it is seen ticked after having been open; a deleted line is not a delivery.
 */
export function review(text: string, known: { open: Record<string, string>; delivered: { id: string; label: string; at: string }[] }, now: Date) {
  const open: Record<string, string> = {};
  const items: { label: string; at: string }[] = [];
  const delivered = [...known.delivered];
  for (const line of text.split("\n")) {
    const item = checklistItem(line);
    const id = item?.marker?.id;
    if (!item || !id || !item.marker?.at) continue;
    if (!item.ticked) {
      open[id] = labelOf(line);
      items.push({ label: open[id], at: item.marker.at });
    } else if (known.open[id] && !delivered.some((d) => d.id === id)) delivered.push({ id, label: labelOf(line), at: now.toISOString() });
  }
  const cutoff = now.getTime() - KEEP_DELIVERED_DAYS * 86400_000;
  return { open, items: items.slice(0, 15), delivered: delivered.filter((d) => Date.parse(d.at) >= cutoff).slice(-30) };
}

export const queueFor = (ctx: JobContext) => join(stationFolder(ctx.env, ctx.stateDir), `final-queue-${ctx.account.id}.md`);

const header = (label: string) =>
  `# Final review: ${label}\n\nOne line per deliverable waiting for final review, e.g. "- [ ] Reel 3 v2". Tick it once it passes.\nThe client sees these names on their Station page ("in final review", then "delivered" once ticked), so write them for the client.\nStation stamps new lines with a hidden marker so the Final gate knows how long each has waited.\n\n`;

export default async function run(ctx: JobContext): Promise<JobResult> {
  const file = queueFor(ctx);
  try {
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, header(ctx.account.label));
    }
    const before = readFileSync(file, "utf8");
    const { text, marked } = markNewLines(before, ctx.now.toISOString());
    if (marked.length) writeFileSync(file, text);
    const q = readQueue(text);
    // Remember what was open, so a tick on the next run is recognised as a delivery.
    const stateFile = join(ctx.stateDir, `final-${ctx.account.id}.json`);
    const known = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { open: {}, delivered: [] };
    const r = review(text, known, ctx.now);
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ open: r.open, delivered: r.delivered }));
    const hours = q.oldestAt ? (ctx.now.getTime() - Date.parse(q.oldestAt)) / H : 0;
    const oldest = q.oldestAt ? `, oldest ${hours < 1 ? "<1h" : `${Math.round(hours)}h`}` : "";
    return {
      ok: true,
      message: `${q.waiting} deliverable${q.waiting === 1 ? "" : "s"} waiting for final review${oldest}${marked.length ? ` · ${marked.length} new` : ""}`,
      gates: [{ gate: "final", waiting: q.waiting, oldestAt: q.oldestAt, items: r.items, delivered: r.delivered.map(({ label, at }) => ({ label, at })) }],
    };
  } catch (err) {
    return { ok: false, message: `cannot read ${file}: ${(err as Error).message}` };
  }
}
