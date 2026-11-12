// Router, every 5 minutes: carries out the Done presses made on Station's Needs me tab.
// Station cannot reach the notes folder, so a press is only remembered there. This job asks Station which presses are
// still to do (/api/station/done, owner key), ticks the matching lines in the checklist files, and tells Station they
// are done. A final-review file is re-read straight away so its gate and the client's page are up to date.
// Only file names and labels Station already holds come down; nothing new goes up.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beat, type JobContext, type JobResult } from "../client.mts";
import { checklistItem, clean, myt, stationFolder } from "../queue.mts";
import finalCheck, { labelOf } from "./final-check.mts";

/** One Done press: the checklist file, when it was pressed, and (for one named line) its label. */
export type Mark = { key: string; at: string; file: string; gate: string; account: string; label?: string };

const FILE = /^[a-z0-9][a-z0-9._-]{0,80}\.md$/;

/**
 * Pure: ticks the lines a press covers. With a label, the one open line with that name. Without, every open line
 * that was already waiting when the button was pressed (lines added later are left alone).
 */
export function applyMark(text: string, mark: Pick<Mark, "at" | "label">, note: string): { text: string; ticked: number } {
  let ticked = 0;
  const lines = text.split("\n").map((line) => {
    const item = checklistItem(line);
    if (!item || item.ticked || !item.marker?.id || !item.marker.at) return line;
    if (mark.label !== undefined ? ticked > 0 || labelOf(line) !== mark.label : item.marker.at > mark.at) return line;
    ticked++;
    const done = line.replace(/^(\s*[-*] )\[ \]/, "$1[x]");
    return note ? done.replace(/ <!-- rk:/, ` · ${clean(note)} <!-- rk:`) : done;
  });
  return { text: lines.join("\n"), ticked };
}

export default async function run(ctx: JobContext): Promise<JobResult> {
  const url = new URL("/api/station/done", ctx.env.STATION_URL);
  const headers = { "content-type": "application/json", "x-station-key": ctx.env.STATION_KEY ?? "" };
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, message: `done endpoint answered ${res.status}` };
    const { done } = (await res.json()) as { done: Mark[] };
    if (!done.length) return { ok: true, message: "nothing to tick" };
    const folder = stationFolder(ctx.env, ctx.stateDir);
    const handled: string[] = [];
    const finals = new Set<string>();
    let ticked = 0;
    let missing = 0;
    for (const m of done) {
      if (!FILE.test(m.file)) continue; // never leave the Station folder, whatever came down
      const path = join(folder, m.file);
      if (existsSync(path)) {
        // The client reads final-review lines on their page, so those are ticked without a note.
        const r = applyMark(readFileSync(path, "utf8"), m, m.gate === "final" ? "" : `done in Station ${myt(m.at)}`);
        if (r.ticked) writeFileSync(path, r.text);
        else missing++;
        ticked += r.ticked;
        if (r.ticked && m.gate === "final") finals.add(m.account);
      } else missing++;
      handled.push(m.key);
    }
    // A final-review tick is a delivery: re-read that client's checklist now instead of waiting for 18:00.
    for (const account of finals) {
      const r = await finalCheck({ ...ctx, job: { id: `${account}-final-check`, account }, account: { id: account, label: account } });
      for (const g of r.gates ?? []) await beat(ctx.env, { ...g, account });
    }
    const ack = await fetch(url, { method: "POST", headers, body: JSON.stringify({ ack: handled }), signal: AbortSignal.timeout(15_000) });
    if (!ack.ok) return { ok: false, message: `ticked ${ticked}, but Station refused the confirmation (${ack.status})` };
    return { ok: true, message: `${ticked} line${ticked === 1 ? "" : "s"} ticked from Station${missing ? ` · ${missing} already gone` : ""}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
