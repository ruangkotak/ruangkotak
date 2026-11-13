import type { NextRequest } from "next/server";
import { DONE_KEEP_MS, DRAFT_FILE, DRAFT_LIST_MAX, DRAFT_PREVIEW_MAX, type DraftDecision, type DraftView } from "@/lib/station";
import { ownerRequest } from "@/lib/station-live";
import { draftStore } from "@/lib/store";

// Content drafts on the Needs me tab: read, approve or reject. Owner only; anyone else gets a 404.
//   GET                from the page: the drafts the laptop last sent, each with any decision still waiting.
//   GET  ?pending=1    from the laptop (x-station-key): the decisions still to write into the files.
//   POST { file, decision: "approve" | "reject" }   from the page: remember the decision. The laptop rewrites **Status:**.
//   POST { drafts: [] }   from the laptop: the current list (replaces the last one).
//   POST { ack: [] }      from the laptop: those decisions are written.
// Station never touches the notes folder itself: the laptop's draft-review job does the writing. Posting is never done here.

const noStore = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Keeps only well-formed drafts, with capped text, so nothing odd is stored or shown. */
function cleanDrafts(input: unknown): DraftView[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, DRAFT_LIST_MAX).flatMap((d) => {
    const file = str(d?.file, 120);
    if (!DRAFT_FILE.test(file)) return [];
    return [{ file, day: str(d.day, 10), title: str(d.title, 160), status: str(d.status, 24).toUpperCase(), preview: str(d.preview, DRAFT_PREVIEW_MAX), changedAt: str(d.changedAt, 30) }];
  });
}

export async function GET(req: NextRequest) {
  if (!(await ownerRequest(req, false))) return new Response("Not found", { status: 404 });
  try {
    const marks = await draftStore.marks();
    // Decisions the laptop wrote more than 7 days ago are forgotten.
    const old = Object.entries(marks).filter(([, m]) => m.applied && Date.now() - Date.parse(m.at) > DONE_KEEP_MS).map(([f]) => f);
    if (old.length) await draftStore.remove(old);
    if (req.nextUrl.searchParams.get("pending")) {
      const decisions = Object.entries(marks).flatMap(([file, m]) => (m.applied || old.includes(file) ? [] : [{ file, decision: m.decision, at: m.at }]));
      return json({ decisions });
    }
    const pending = Object.fromEntries(Object.entries(marks).filter(([, m]) => !m.applied).map(([f, m]) => [f, m.decision]));
    return json({ drafts: await draftStore.list(), pending });
  } catch (err) {
    console.error("[station] drafts", err);
    return json({ error: "store unavailable" }, 503);
  }
}

export async function POST(req: NextRequest) {
  if (!(await ownerRequest(req, true))) return new Response("Not found", { status: 404 });
  const fromLaptop = !!req.headers.get("x-station-key");
  const body = (await req.json().catch(() => null)) as { file?: unknown; decision?: unknown; drafts?: unknown; ack?: unknown } | null;
  try {
    if (fromLaptop && body && Array.isArray(body.ack)) {
      const files = body.ack.filter((f): f is string => typeof f === "string" && DRAFT_FILE.test(f)).slice(0, 200);
      await draftStore.applied(files);
      return json({ ok: true });
    }
    if (fromLaptop && body && Array.isArray(body.drafts)) {
      const list = cleanDrafts(body.drafts);
      await draftStore.setList(list);
      return json({ ok: true, stored: list.length });
    }
    if (!body || typeof body.file !== "string" || (body.decision !== "approve" && body.decision !== "reject")) return json({ ok: false, error: "Missing file or decision." }, 400);
    // Only a draft the board is showing right now can be decided, and only one decision at a time per file.
    const draft = (await draftStore.list()).find((d) => d.file === body.file);
    if (!draft) return json({ ok: false, error: "That draft is no longer on the board." }, 404);
    const waiting = (await draftStore.marks())[draft.file];
    if (waiting && !waiting.applied) return json({ ok: true }); // already decided, waiting for the laptop
    await draftStore.decide(draft.file, body.decision as DraftDecision, new Date().toISOString());
    return json({ ok: true });
  } catch (err) {
    console.error("[station] drafts", err);
    return json({ ok: false, error: "Store unavailable. Nothing was changed." }, 503);
  }
}
