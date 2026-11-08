// Funnel Operator, every 15 minutes: who commented a trigger word, and (when you turn it on) send them the DM.
//
// Reading: with IG_ACCESS_TOKEN (your own account's Instagram API token) comments come from Instagram's API, free and
// with ids that can be replied to. Without it, from Apify as before (those can be queued but never auto-sent).
// Either way, keyword comments (STATION_IG_KEYWORDS, whole word) on posts from the last 7 days go into a checklist:
// <vault>/Station/dm-queue-<handle>.md. Station's DM gate counts the unticked lines.
//
// Sending (off until STATION_DM_SEND=1, and only with IG_ACCESS_TOKEN and a message in Station/dm-message.md):
// each keyword comment first seen while sending is on gets one private reply, the DM Instagram allows a business to send
// a commenter within 7 days. Its line is ticked "DM sent". Never twice per comment (sent ids are kept even if you
// untick), never your own comments, never the backlog from before sending was on, at most 20 per run. A failed send
// stays unticked with the reason and goes to Needs you. The token is refreshed weekly and saved back to station.env.
// Station gets counts only; names, comments and the message stay on the laptop.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { apify, readSnapshot, scrapeReels, writeSnapshot } from "../apify.mts";
import { setEnvValue, type JobContext, type JobResult } from "../client.mts";
import { mediaComments, me, recentMedia, refreshToken, sendPrivateReply } from "../instagram.mts";
import { appendToQueue, checklistLine, clean, readQueueFile, stationFolder, tickLine } from "../queue.mts";
import { withoutComments } from "../ledger.mts";

export { readQueue } from "../queue.mts";

export const requires = ["STATION_IG_KEYWORDS"];
export const unavailable = (ctx: JobContext) =>
  !ctx.account.instagram ? `${ctx.account.label} has no instagram handle in the registry`
  : !ctx.env.IG_ACCESS_TOKEN && !ctx.env.APIFY_TOKEN ? "set IG_ACCESS_TOKEN (or APIFY_TOKEN to only read comments)"
  : null;

const RECENT_DAYS = 7;
const MAX_POSTS = 3;
const COMMENTS_PER_POST = 100;
const SNAPSHOT_MAX_AGE_H = 12;
const SEEN_CAP = 5000;
const SEND_CAP = 20;
const REFRESH_DAYS = 7;
const DAY = 86400_000;

export type Comment = { id: string; user: string; text: string; at: string; post: string; source: "api" | "apify" };
type ApifyComment = { id?: string; text?: string; ownerUsername?: string; owner?: { username?: string }; timestamp?: string };

export const keywordsOf = (raw: string) => raw.split(",").map((k) => k.trim()).filter(Boolean);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive: "audit" matches "AUDIT please!" but not "auditorium". */
export function matches(text: string, keywords: string[]) {
  return keywords.some((k) => new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(k)}($|[^\\p{L}\\p{N}_])`, "iu").test(text));
}

export function queueLine(c: Pick<Comment, "id" | "user" | "text" | "at" | "post">) {
  return checklistLine(c.id, c.at, `@${clean(c.user)} · "${clean(c.text).slice(0, 140)}" · ${c.post}`);
}

// ---------- the message ----------

export const MESSAGE_TEMPLATE = `<!--
The DM sent to each keyword comment, when sending is on (station-install.mts --dm-send on).
Write it below, outside this comment. {username} becomes the commenter's handle. Keep it short and give them
what they asked for: Instagram allows one message per comment, within 7 days of it.
Example:
Hi {username}! Here's the audit link you asked for: https://ruangkotak.com
-->
`;

/** The message text from dm-message.md (outside HTML comments), or null when there is none yet. */
export function messageFrom(file: string): string | null {
  const text = withoutComments(file).trim();
  return text ? text.slice(0, 1000) : null;
}

export const fill = (template: string, c: Pick<Comment, "user">) => template.replaceAll("{username}", `@${c.user}`);

/** Pure: which fresh keyword comments to DM this run, and which are too old to. */
export function planSends(fresh: Comment[], opts: { sending: boolean; sent: Set<string>; owner: string; now: number; cap?: number }) {
  if (!opts.sending) return { send: [] as Comment[], tooOld: [] as Comment[] };
  const eligible = fresh.filter((c) => c.source === "api" && !opts.sent.has(c.id) && c.user.toLowerCase() !== opts.owner);
  const tooOld = eligible.filter((c) => opts.now - Date.parse(c.at) >= RECENT_DAYS * DAY);
  const send = eligible.filter((c) => !tooOld.includes(c)).slice(0, opts.cap ?? SEND_CAP);
  return { send, tooOld };
}

// ---------- reading ----------

async function viaApi(ctx: JobContext, now: number): Promise<{ posts: number; comments: Comment[] }> {
  const media = (await recentMedia(ctx.env, 10)).filter((m) => m.timestamp && now - Date.parse(m.timestamp) < RECENT_DAYS * DAY).slice(0, MAX_POSTS);
  const out: Comment[] = [];
  for (const m of media) {
    for (const c of await mediaComments(ctx.env, m.id, COMMENTS_PER_POST)) {
      const user = c.username ?? c.from?.username ?? "";
      if (c.id && c.text) out.push({ id: c.id, user, text: c.text, at: c.timestamp ? new Date(c.timestamp).toISOString() : new Date(now).toISOString(), post: m.permalink ?? m.id, source: "api" });
    }
  }
  return { posts: media.length, comments: out };
}

async function viaApify(ctx: JobContext, handle: string, now: number): Promise<{ posts: number; comments: Comment[] }> {
  const token = ctx.env.APIFY_TOKEN!;
  let snap = readSnapshot(ctx.stateDir, handle);
  if (!snap || now - Date.parse(snap.at) > SNAPSHOT_MAX_AGE_H * 3600_000) {
    snap = { handle, at: new Date(now).toISOString(), reels: await scrapeReels(token, handle, 6) };
    if (snap.reels.length) writeSnapshot(ctx.stateDir, snap);
  }
  const posts = snap.reels.filter((r) => now - Date.parse(r.at) < RECENT_DAYS * DAY).slice(0, MAX_POSTS);
  const out: Comment[] = [];
  for (const p of posts) {
    const items = await apify<ApifyComment>(token, "apify~instagram-comment-scraper", { directUrls: [p.url], resultsLimit: COMMENTS_PER_POST });
    const comments = items.map((i) => ({ id: i.id ?? "", user: i.ownerUsername ?? i.owner?.username ?? "", text: i.text ?? "", at: i.timestamp ?? "", post: p.url, source: "apify" as const })).filter((c) => c.id && c.text);
    if (items.length && !comments.length) throw new Error(`comment data has an unexpected shape (fields: ${Object.keys(items[0]).slice(0, 8).join(",")})`);
    out.push(...comments.map((c) => ({ ...c, at: Number.isNaN(Date.parse(c.at)) ? new Date(now).toISOString() : new Date(c.at).toISOString() })));
  }
  return { posts: posts.length, comments: out };
}

// ---------- the run ----------

type State = { seen: string[]; sent: string[]; refreshedAt?: string };

export default async function run(ctx: JobContext): Promise<JobResult> {
  const handle = ctx.account.instagram!;
  const owner = handle.toLowerCase();
  const keywords = keywordsOf(ctx.env.STATION_IG_KEYWORDS!);
  const folder = stationFolder(ctx.env, ctx.stateDir);
  const queue = join(folder, `dm-queue-${handle}.md`);
  const messageFile = join(folder, "dm-message.md");
  const stateFile = join(ctx.stateDir, "ig", `dm-${handle}.json`);
  const legacySeen = join(ctx.stateDir, "ig", `dm-seen-${handle}.json`);
  const now = Date.now();
  const api = !!ctx.env.IG_ACCESS_TOKEN;
  const notes: string[] = [];
  try {
    const state: State = existsSync(stateFile)
      ? JSON.parse(readFileSync(stateFile, "utf8"))
      : { seen: existsSync(legacySeen) ? JSON.parse(readFileSync(legacySeen, "utf8")) : [], sent: [] };
    const save = () => {
      mkdirSync(dirname(stateFile), { recursive: true });
      writeFileSync(stateFile, JSON.stringify({ ...state, seen: state.seen.slice(-SEEN_CAP), sent: state.sent.slice(-SEEN_CAP) }));
    };

    // Keep the token alive: long-lived tokens last 60 days; refresh weekly and store the new one.
    if (api && (!state.refreshedAt || now - Date.parse(state.refreshedAt) > REFRESH_DAYS * DAY)) {
      try {
        const fresh = await refreshToken(ctx.env);
        setEnvValue("IG_ACCESS_TOKEN", fresh);
        ctx.env.IG_ACCESS_TOKEN = fresh;
        state.refreshedAt = new Date(now).toISOString();
      } catch (err) {
        notes.push((err as Error).message);
      }
    }

    const { posts, comments } = api ? await viaApi(ctx, now) : await viaApify(ctx, handle, now);
    const seen = new Set(state.seen);
    const fresh = comments.filter((c) => !seen.has(c.id) && c.user.toLowerCase() !== owner && matches(c.text, keywords)).sort((a, b) => a.at.localeCompare(b.at));
    for (const c of comments) seen.add(c.id);
    state.seen = [...seen];
    appendToQueue(queue, `# Comment → DM queue for @${handle}\n\nTick a box once the DM is sent (Station ticks the ones it sends itself). Station counts the unticked ones (gate: DM). Keywords: ${keywords.join(", ")}`, fresh.map(queueLine));
    save();

    // Sending.
    const wantSend = ctx.env.STATION_DM_SEND === "1";
    if (!existsSync(messageFile)) {
      mkdirSync(folder, { recursive: true });
      writeFileSync(messageFile, MESSAGE_TEMPLATE);
    }
    const message = messageFrom(readFileSync(messageFile, "utf8"));
    const sending = wantSend && api && !!message;
    if (wantSend && !api) notes.push("sending needs IG_ACCESS_TOKEN");
    if (wantSend && api && !message) notes.push("sending is on but dm-message.md is empty");
    const plan = planSends(fresh, { sending, sent: new Set(state.sent), owner, now });
    let sentCount = 0;
    const failures: string[] = [];
    let text = existsSync(queue) ? readFileSync(queue, "utf8") : "";
    if (plan.send.length) {
      const { id: igId } = await me(ctx.env);
      for (const c of plan.send) {
        try {
          await sendPrivateReply(ctx.env, igId, c.id, fill(message!, c));
          state.sent.push(c.id);
          text = tickLine(text, c.id, `DM sent ${new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ")}`);
          sentCount++;
        } catch (err) {
          failures.push((err as Error).message);
          text = text.replace(new RegExp(`( <!-- rk:id=${escape(c.id)} )`), ` · not sent: ${clean((err as Error).message).slice(0, 80)}$1`);
        }
      }
      for (const c of plan.tooOld) text = text.replace(new RegExp(`( <!-- rk:id=${escape(c.id)} )`), " · over 7 days old, DM by hand$1");
      writeFileSync(queue, text);
      save();
    }

    const q = readQueueFile(queue);
    const mode = sending ? `sending on: ${sentCount} DM${sentCount === 1 ? "" : "s"} sent` : wantSend ? "sending blocked" : "sending off";
    const parts = [
      posts ? `${posts} recent post${posts === 1 ? "" : "s"} · ${comments.length} comments read (${api ? "Instagram API" : "Apify"})` : `no posts in the last ${RECENT_DAYS} days`,
      `${fresh.length} new keyword comment${fresh.length === 1 ? "" : "s"}`,
      mode,
      `${q.waiting} waiting for a DM`,
      ...notes,
    ];
    const attention = [
      failures.length && `${failures.length} DM${failures.length === 1 ? "" : "s"} failed to send: ${failures[0]}`,
      wantSend && !sending && `DM sending is on but blocked: ${notes.join("; ")}`,
    ].filter(Boolean).join("; ");
    return { ok: true, message: parts.join(" · "), attention: attention || undefined, gates: [{ gate: "dm", waiting: q.waiting, oldestAt: q.oldestAt }] };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
