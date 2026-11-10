// Router, every 15 minutes: send each new ask to a desk.
// Asks live in <vault>/Station/Asks.md (created on first run): one line per ask, "- [ ] cut the hook for reel 14".
// A #tag picks the desk (#editor, #billing-clerk, #cdo …); otherwise the first keyword that names the work does
// ("caption" → Caption Editor, "invoice" → Billing Clerk). The line gets "→ Desk" and a hidden marker. An ask no desk
// matches is marked "→ ? (add a #desk)" and checked again each run until it gets one; those go to Needs you.
// Station gets counts per desk, never the ask text.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { checklistItem, markNewLines, stationFolder } from "../queue.mts";

export type DeskRef = { id: string; name: string; dept: string };

// Department tags land on the desk that takes new work there.
const DEPT_LEAD: Record<string, string> = { cmo: "strategist", cdo: "art-director", coo: "coo-lead", cfo: "controller", cto: "platform-engineer", router: "router" };
// Keyword → desk, checked in the order the words appear in the ask.
const KEYWORDS: [RegExp, string][] = [
  [/^(caption|captions|subtitle|subtitles)$/, "caption-editor"],
  [/^(reel|reels|edit|cut|trim|recut)$/, "editor"],
  [/^(thumbnail|cover|carousel|design|banner|slide|slides)$/, "designer"],
  [/^(motion|animation|animate)$/, "motion-designer"],
  [/^(colour|color|grade|grading)$/, "colorist"],
  [/^(sound|audio|music|voiceover|vo|mix)$/, "sound-editor"],
  [/^(script|hook|hooks|storyboard)$/, "scriptwriter"],
  [/^(post|publish|schedule|upload)$/, "publisher"],
  [/^(shoot|film|filming|recce)$/, "shoot-producer"],
  [/^(invoice|invoices|payment|bill|billing|receipt)$/, "billing-clerk"],
  [/^(quote|proposal|client|onboard|onboarding)$/, "account-manager"],
  [/^(website|site|bug|deploy|landing)$/, "web-builder"],
  [/^(analytics|insights|views|report|metrics)$/, "performance-analyst"],
  [/^(scrape|scraper)$/, "scrape-agent"],
  [/^(strategy|plan|positioning|pillar|pillars)$/, "strategist"],
  [/^(cost|costs|budget|spend)$/, "cost-analyst"],
  [/^(backup|restore)$/, "backup-recovery"],
  [/^(password|credential|credentials|security|2fa)$/, "security-officer"],
];

const slug = (s: string) => s.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Pure: the desk an ask belongs to, or null. A #tag wins over keywords. */
export function deskFor(text: string, desks: DeskRef[]): DeskRef | null {
  const byKey = new Map<string, DeskRef>();
  for (const d of desks) {
    byKey.set(d.id, d);
    byKey.set(slug(d.name), d);
  }
  for (const [, tag] of text.matchAll(/(?:^|\s)#([a-z0-9-]+)/gi)) {
    const t = tag.toLowerCase();
    const hit = byKey.get(t) ?? (DEPT_LEAD[t] ? byKey.get(DEPT_LEAD[t]) : undefined);
    if (hit) return hit;
  }
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    const k = KEYWORDS.find(([re]) => re.test(word));
    if (k && byKey.has(k[1])) return byKey.get(k[1])!;
  }
  return null;
}

const UNROUTED = " · → ? (add a #desk)";

/** Pure: routes new asks and re-tries unrouted ones. Returns the new text and counts. */
export function route(text: string, desks: DeskRef[], now: string) {
  const routed: DeskRef[] = [];
  // Re-try asks marked unrouted: strip their suffix and marker so they are new again.
  const retried = text
    .split("\n")
    .map((line) => {
      const item = checklistItem(line);
      if (!item || item.ticked || item.marker?.desk !== "none") return line;
      // Only touch the line once a desk matches, so an ask that still matches nothing is never rewritten.
      const bare = line.replace(/ <!-- rk:[^>]*-->\s*$/, "").replace(UNROUTED, "");
      return deskFor(bare, desks) ? bare : line;
    })
    .join("\n");
  const { text: out } = markNewLines(retried, now, (line) => {
    const desk = deskFor(line, desks);
    if (desk) routed.push(desk);
    return { text: `${line.trimEnd()}${desk ? ` · → ${desk.name}` : UNROUTED}`, fields: { desk: desk?.id ?? "none" } };
  });
  let open = 0, unrouted = 0;
  for (const line of out.split("\n")) {
    const item = checklistItem(line);
    if (!item || item.ticked) continue;
    open++;
    if (item.marker?.desk === "none") unrouted++;
  }
  const changed = out !== text;
  return { text: out, routed, open, unrouted, changed };
}

export const asksFile = (ctx: JobContext) => join(stationFolder(ctx.env, ctx.stateDir), "Asks.md");
export const ASKS_HEADER = `# Asks\n\nOne line per ask: "- [ ] cut the hook for reel 14 #editor". The router adds "→ Desk" every 15 minutes.\nUse a #desk or #department tag to choose; tick a line when it is done.\n\n`;

export default async function run(ctx: JobContext): Promise<JobResult> {
  const file = asksFile(ctx);
  try {
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, ASKS_HEADER);
    }
    const desks: DeskRef[] = ctx.registry.departments.flatMap((d) => d.desks.map((k) => ({ id: k.id, name: k.name, dept: d.id })));
    const r = route(readFileSync(file, "utf8"), desks, ctx.now.toISOString());
    if (r.changed) writeFileSync(file, r.text);
    const counts = new Map<string, number>();
    for (const d of r.routed) counts.set(d.name, (counts.get(d.name) ?? 0) + 1);
    const where = [...counts].map(([n, c]) => `${n} ${c}`).join(", ");
    return {
      ok: true,
      message: `${r.routed.length} new ask${r.routed.length === 1 ? "" : "s"} routed${where ? ` (${where})` : ""} · ${r.open} open${r.unrouted ? ` · ${r.unrouted} need a desk` : ""}`,
      attention: r.unrouted ? `${r.unrouted} ask${r.unrouted === 1 ? " needs" : "s need"} a desk (add a #tag in Asks.md)` : undefined,
    };
  } catch (err) {
    return { ok: false, message: `cannot read ${file}: ${(err as Error).message}` };
  }
}
