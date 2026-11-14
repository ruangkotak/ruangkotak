import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ASK_PENDING_MAX, cleanAsk, type AskRecord } from "@/lib/station";
import { liveRegistry, ownerRequest } from "@/lib/station-live";
import { askStore } from "@/lib/store";

// Asks typed on the Needs me tab. Owner only; anyone else gets a 404.
//   POST { text, desk? }  from the page: keep this ask until the laptop collects it.
//   GET                   from the page or the laptop (x-station-key): the asks still waiting to be collected.
//   POST { ack: [] }      from the laptop: those are written into Station/Asks.md, so they are deleted here.
// KNOX never touches the notes folder itself and never runs an agent: the laptop's route-asks job does both.

const noStore = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

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
    const { registry } = await liveRegistry();
    const ask = cleanAsk(body ?? {}, registry);
    if (!ask.ok) return json({ ok: false, error: ask.error }, 400);
    const waiting = await askStore.all();
    if (waiting.length >= ASK_PENDING_MAX) return json({ ok: false, error: "Your laptop has not collected the earlier asks yet. Wake it, then try again." }, 409);
    if (waiting.some((a) => a.text === ask.value.text)) return json({ ok: true }); // a double press
    const record: AskRecord = { id: randomUUID(), ...ask.value, at: new Date().toISOString() };
    await askStore.add(record);
    return json({ ok: true, ask: record });
  } catch (err) {
    console.error("[station] asks", err);
    return json({ ok: false, error: "Store unavailable. Nothing was saved." }, 503);
  }
}
