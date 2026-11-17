import type { NextRequest } from "next/server";
import { addAsk, json, ownerRequest } from "@/lib/station-live";
import { askStore } from "@/lib/store";

// Asks typed on the Needs me tab. Owner only; anyone else gets a 404.
//   POST { text, desk? }  from the page: keep this ask until the laptop collects it.
//   GET                   from the page or the laptop (x-station-key): the asks still waiting to be collected.
//   POST { ack: [] }      from the laptop: those are written into Station/Asks.md, so they are deleted here.
// KNOX never touches the notes folder itself and never runs an agent: the laptop's route-asks job does both.


export async function GET(req: NextRequest) {
  if (!(await ownerRequest(req, false))) return new Response("Not found", { status: 404 });
  try {
    return json({ asks: await askStore.all() });
  } catch (err) {
    console.error("[station] asks", err);
    return json({ error: "store unavailable" }, 503);
  }
}

export async function POST(req: NextRequest) {
  if (!(await ownerRequest(req, true))) return new Response("Not found", { status: 404 });
  const body = (await req.json().catch(() => null)) as { text?: unknown; desk?: unknown; ack?: unknown } | null;
  try {
    if (body && Array.isArray(body.ack)) {
      await askStore.remove(body.ack.filter((k): k is string => typeof k === "string").slice(0, 200));
      return json({ ok: true });
    }
    const added = await addAsk(body ?? {});
    return added.ok ? json(added) : json({ ok: false, error: added.error }, added.status);
  } catch (err) {
    console.error("[station] asks", err);
    return json({ ok: false, error: "Store unavailable. Nothing was saved." }, 503);
  }
}
