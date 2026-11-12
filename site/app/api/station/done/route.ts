import type { NextRequest } from "next/server";
import { DONE_KEEP_MS, doneFile, parseDoneKey, type DoneMarks } from "@/lib/station";
import { getSnapshot, liveRegistry, ownerRequest } from "@/lib/station-live";
import { doneStore } from "@/lib/store";

// Done presses from the Needs me tab. Owner only; anyone else gets a 404.
//   POST { key }      from the page: remember that this Needs me item was cleared. It disappears from the queue at once.
//   GET               from the laptop (x-station-key): the presses still to carry out, each with its checklist file.
//   POST { ack: [] }  from the laptop: those lines are ticked.
// Station never touches the notes folder itself: the laptop's needs-me-sync job does the ticking.

const noStore = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

/** Drops presses that were carried out more than 7 days ago. Ones the laptop has not done yet are always kept. */
async function pruned(): Promise<DoneMarks> {
  const all = await doneStore.all();
  const old = Object.entries(all).filter(([, m]) => m.applied && Date.now() - Date.parse(m.at) > DONE_KEEP_MS).map(([k]) => k);
  if (old.length) await doneStore.remove(old);
  return Object.fromEntries(Object.entries(all).filter(([k]) => !old.includes(k)));
}

export async function GET(req: NextRequest) {
  if (!(await ownerRequest(req, false))) return new Response("Not found", { status: 404 });
  try {
    const [marks, { registry }] = await Promise.all([pruned(), liveRegistry()]);
    const done = Object.entries(marks).flatMap(([key, m]) => {
      const parts = m.applied ? null : parseDoneKey(key);
      const account = parts && registry.accounts.find((a) => a.id === parts.account);
      const file = account && doneFile(parts!.gate, account);
      return file ? [{ key, at: m.at, file, gate: parts!.gate, account: parts!.account, label: parts!.label }] : [];
    });
    return json({ done });
  } catch (err) {
    console.error("[station] done", err);
    return json({ error: "store unavailable" }, 503);
  }
}

export async function POST(req: NextRequest) {
  if (!(await ownerRequest(req, true))) return new Response("Not found", { status: 404 });
  const body = (await req.json().catch(() => null)) as { key?: unknown; ack?: unknown } | null;
  try {
    if (body && Array.isArray(body.ack)) {
      const keys = body.ack.filter((k): k is string => typeof k === "string").slice(0, 200);
      await doneStore.applied(keys);
      return json({ ok: true });
    }
    if (!body || typeof body.key !== "string") return json({ ok: false, error: "Missing key." }, 400);
    // Only something on the queue right now, and of a kind a press can clear, is accepted.
    const snap = await getSnapshot({ mode: "owner", account: "all" });
    const item = snap.needsMe?.find((n) => n.key === body.key);
    if (!item) return json({ ok: true }); // already cleared
    if (!item.clear) return json({ ok: false, error: "This one is cleared where it lives, not from here." }, 400);
    await doneStore.add(item.key, new Date().toISOString());
    return json({ ok: true });
  } catch (err) {
    console.error("[station] done", err);
    return json({ ok: false, error: "Store unavailable. Nothing was changed." }, 503);
  }
}
