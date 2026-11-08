// CDO Reviewer, 18:00 weekdays, one job per client (client-demo-final-check, and any "<client>-final-check" sharing this
// script): which deliverables are waiting for final review?
// The checklist is <vault>/Station/final-queue-<account>.md (created on first run with instructions). Add a line per
// deliverable, by hand or by your editors: "- [ ] Reel 3 v2". Tick it once it has passed final review.
// Each new line is stamped with a hidden marker, so Station's Final gate knows how long it has waited (48h window).
// The client's own Station view shows the same count for their account.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { markNewLines, readQueue, stationFolder } from "../queue.mts";

const H = 3600_000;

export const queueFor = (ctx: JobContext) => join(stationFolder(ctx.env, ctx.stateDir), `final-queue-${ctx.account.id}.md`);

const header = (label: string) =>
  `# Final review: ${label}\n\nOne line per deliverable waiting for final review, e.g. "- [ ] Reel 3 v2". Tick it once it passes.\nStation stamps new lines with a hidden marker so the Final gate knows how long each has waited.\n\n`;

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
    const hours = q.oldestAt ? (ctx.now.getTime() - Date.parse(q.oldestAt)) / H : 0;
    const oldest = q.oldestAt ? `, oldest ${hours < 1 ? "<1h" : `${Math.round(hours)}h`}` : "";
    return {
      ok: true,
      message: `${q.waiting} deliverable${q.waiting === 1 ? "" : "s"} waiting for final review${oldest}${marked.length ? ` · ${marked.length} new` : ""}`,
      gates: [{ gate: "final", waiting: q.waiting, oldestAt: q.oldestAt }],
    };
  } catch (err) {
    return { ok: false, message: `cannot read ${file}: ${(err as Error).message}` };
  }
}
