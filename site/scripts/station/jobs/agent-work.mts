// Router, every 15 minutes: hand routed asks to the desk's Claude agent and bring back a draft for approval.
//
// Takes asks from <vault>/Station/Asks.md that route-asks sent to a desk with an agent (registry "agent": creative-lead,
// social-lead, account-director, media-buyer, security-reviewer). For each, runs Claude Code on this laptop in print mode
// as that agent: its .claude/agents/<name>.md instructions, READ-ONLY tools (Read, Grep, Glob: no shell, no edits, no
// web), at most 8 turns, 6 minutes. The answer is written to <vault>/Station/Drafts/<date> <ask>.md, linked from the
// ask, and listed in drafts-queue.md. Station's Drafts gate counts drafts waiting for approval (24 h window).
// Approving (ticking) sends, posts or publishes nothing: the draft is for you to use.
//
// Off until STATION_AGENTS=1 (station-install --agents on): every run uses your Claude plan. At most 2 asks per run;
// a failed ask is retried once on the next run, then left for you with the reason. Station gets counts, never ask text.
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { JobContext, JobResult } from "../client.mts";
import { appendToQueue, checklistItem, checklistLine, clean, readQueueFile, stationFolder } from "../queue.mts";
import { labelOf } from "./final-check.mts";

const PER_RUN = 2;
const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = 6 * 60_000;
export const TOOLS = ["Read", "Grep", "Glob"];
export const BLOCKED = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Task"];

const claudeOnPath = () => {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", ["claude"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

export const unavailable = (ctx: JobContext) =>
  ctx.env.STATION_AGENTS !== "1" ? "agents are off (station-install --agents on)" : !claudeOnPath() ? "Claude Code (claude) is not installed on this laptop" : null;

export type Ask = { id: string; desk: string; text: string };

/** Pure: unticked, routed asks whose desk has an agent and that are not done or out of attempts. */
export function asksToWork(asksText: string, agentOf: Map<string, string>, state: State): Ask[] {
  const out: Ask[] = [];
  for (const line of asksText.split("\n")) {
    const item = checklistItem(line);
    const id = item?.marker?.id, desk = item?.marker?.desk;
    if (!item || item.ticked || !id || !desk || desk === "none" || !agentOf.has(desk)) continue;
    if (state.done[id] || (state.failed[id] ?? 0) >= MAX_ATTEMPTS) continue;
    // The ask as typed: no "→ Desk", no "draft:" link the router or this job added.
    out.push({ id, desk, text: labelOf(line).replace(/ · → .*$/, "").replace(/ · draft: .*$/, "") });
  }
  return out;
}

/** The agent's own instructions: its .md file without the frontmatter. */
export function agentInstructions(file: string) {
  return file.replace(/^---[\s\S]*?\n---\s*/, "").trim();
}

export function promptFor(ask: Ask, deskName: string, agent: string) {
  return [
    `You are working the "${deskName}" desk at RUANGKOTAK as the ${agent} agent.`,
    `Alan (the owner) asked: "${ask.text}"`,
    "",
    "Write the draft he asked for. It goes to Alan for approval before anything is sent, posted or published, so:",
    "- Write the deliverable itself (copy, plan, brief, reply draft…), ready to use, in Markdown.",
    "- You may read files in this repository for context. You cannot change anything or browse the web.",
    "- If you lack a fact (a number, name, date or price), write [TO CONFIRM] instead of inventing it.",
    "- Never say you sent, posted, scheduled or changed anything.",
    '- End with "Notes for Alan": your assumptions and what to check.',
  ].join("\n");
}

export function claudeArgs(prompt: string, instructions: string) {
  return ["-p", prompt, "--output-format", "json", "--append-system-prompt", instructions, "--allowedTools", TOOLS.join(","), "--disallowedTools", BLOCKED.join(","), "--max-turns", "8"];
}

function runClaude(args: string[], cwd: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  return new Promise((done) =>
    execFile("claude", args, { cwd, timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      let out: { result?: string; is_error?: boolean; subtype?: string } | null = null;
      try {
        out = JSON.parse(stdout);
      } catch {}
      if (out && !out.is_error && typeof out.result === "string" && out.result.trim()) return done({ ok: true, text: out.result.trim() });
      const why = out?.subtype && out.subtype !== "success" ? out.subtype : err?.killed ? "timed out" : (stderr || err?.message || "no answer").trim().split("\n")[0];
      done({ ok: false, reason: clean(why).slice(0, 120) });
    }),
  );
}

type State = { done: Record<string, { at: string; file: string }>; failed: Record<string, number> };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ask";
const myt = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString();

export default async function run(ctx: JobContext): Promise<JobResult> {
  const folder = stationFolder(ctx.env, ctx.stateDir);
  const asksFile = join(folder, "Asks.md");
  const queue = join(folder, "drafts-queue.md");
  const stateFile = join(ctx.stateDir, "agents.json");
  try {
    if (!existsSync(asksFile)) return { ok: true, message: "no Asks.md yet", gates: [{ gate: "drafts", ...readQueueFile(queue) }] };
    const state: State = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { done: {}, failed: {} };
    const desks = ctx.registry.departments.flatMap((d) => d.desks);
    const agentOf = new Map(desks.filter((k) => k.agent).map((k) => [k.id, k.agent!]));
    let asksText = readFileSync(asksFile, "utf8");
    const todo = asksToWork(asksText, agentOf, state).slice(0, PER_RUN);
    const made: string[] = [];
    const failures: string[] = [];

    for (const ask of todo) {
      const agent = agentOf.get(ask.desk)!;
      const deskName = desks.find((k) => k.id === ask.desk)!.name;
      const agentFile = join(ctx.repo, ".claude", "agents", `${agent}.md`);
      if (!existsSync(agentFile)) {
        state.failed[ask.id] = MAX_ATTEMPTS;
        failures.push(`${agent}.md not found`);
        continue;
      }
      const r = await runClaude(claudeArgs(promptFor(ask, deskName, agent), agentInstructions(readFileSync(agentFile, "utf8"))), ctx.repo);
      if (!r.ok) {
        state.failed[ask.id] = (state.failed[ask.id] ?? 0) + 1;
        failures.push(r.reason);
        if (state.failed[ask.id] >= MAX_ATTEMPTS)
          asksText = asksText.replace(new RegExp(`( <!-- rk:id=${ask.id} )`), ` · agent failed: ${r.reason.slice(0, 60)}$1`);
        continue;
      }
      const name = `${myt(ctx.now).slice(0, 10)} ${slug(ask.text)}`;
      const file = join(folder, "Drafts", `${name}.md`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, [`# ${ask.text}`, "", `Desk: ${deskName} · agent: ${agent} · ${myt(ctx.now).slice(0, 16).replace("T", " ")} (Malaysia time)`, "Draft for your approval: nothing has been sent, posted or published.", "", "---", "", r.text, ""].join("\n"));
      asksText = asksText.replace(new RegExp(`( <!-- rk:id=${ask.id} )`), ` · draft: [[Drafts/${name}]]$1`);
      appendToQueue(queue, "# Drafts waiting for approval\n\nEach line is an agent's draft for one of your asks. Read it, use it, and tick the line. Ticking only clears it from the Drafts gate; it sends nothing.", [checklistLine(ask.id, ctx.now.toISOString(), `${deskName}: ${clean(ask.text).slice(0, 80)} → [[Drafts/${name}]]`)]);
      state.done[ask.id] = { at: ctx.now.toISOString(), file: `Drafts/${name}.md` };
      made.push(agent);
    }

    if (todo.length) writeFileSync(asksFile, asksText);
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(state));
    const q = readQueueFile(queue);
    // Asks the agent gave up on stay in Needs you until you tick or delete them.
    const open = new Set(asksText.split("\n").map((l) => checklistItem(l)).filter((i) => i && !i.ticked && i.marker?.id).map((i) => i!.marker!.id));
    const givenUp = Object.entries(state.failed).filter(([id, n]) => n >= MAX_ATTEMPTS && open.has(id)).length;
    const by = [...new Set(made)].map((a) => `${a} ${made.filter((m) => m === a).length}`).join(", ");
    return {
      ok: true,
      message: `${made.length} draft${made.length === 1 ? "" : "s"} written${by ? ` (${by})` : ""} · ${q.waiting} waiting for approval${failures.length ? ` · ${failures.length} failed` : ""}`,
      attention: [
        failures.length && `${failures.length} agent run${failures.length === 1 ? "" : "s"} failed: ${failures[0]}`,
        givenUp && !failures.length && `${givenUp} ask${givenUp === 1 ? "" : "s"} the agent could not draft (see Asks.md)`,
      ].filter(Boolean).join("; ") || undefined,
      gates: [{ gate: "drafts", waiting: q.waiting, oldestAt: q.oldestAt }],
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
