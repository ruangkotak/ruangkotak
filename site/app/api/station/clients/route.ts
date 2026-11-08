import type { NextRequest } from "next/server";
import { hashKey, newClientKey, onboarding, validateClient, type ClientRecord } from "@/lib/station";
import { fileRegistry, ownerRequest } from "@/lib/station-live";
import { clientStore, stationStore } from "@/lib/store";

// The Clients tab: list, add, rotate a link, pause, resume, update, remove. Owner only; anyone else gets a 404.
// A new or rotated key is returned once and never stored, only its hash. Writes made with the session cookie must come
// from Station's own page (Origin check), on top of the cookie being SameSite=Lax.

const noStore = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

const owner = ownerRequest;

const view = (c: ClientRecord, runs: Awaited<ReturnType<typeof stationStore.runs>>, gates: Awaited<ReturnType<typeof stationStore.gates>>) => {
  const { keyHash: _, ...rest } = c;
  return { ...rest, steps: onboarding(c, runs, gates) };
};

export async function GET(req: NextRequest) {
  if (!(await owner(req, false))) return new Response("Not found", { status: 404 });
  const clients = await clientStore.all(); // always fresh: this is the list being edited
  const jobIds = clients.flatMap((c) => [`${c.id}-velocity`, `${c.id}-final-check`]);
  const [runs, gates] = await Promise.all([stationStore.runs(jobIds), stationStore.gates()]);
  return json({ clients: clients.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => view(c, runs, gates)) });
}

export async function POST(req: NextRequest) {
  if (!(await owner(req, true))) return new Response("Not found", { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return json({ ok: false, error: "Missing action." }, 400);
  const clients = await clientStore.all();
  const now = new Date().toISOString();
  try {
    if (body.action === "create") {
      const taken = new Set([...fileRegistry.accounts.map((a) => a.id), ...clients.map((c) => c.id), ...fileRegistry.jobs.map((j) => j.id)]);
      const v = validateClient(body, taken);
      if (!v.ok) return json({ ok: false, error: v.error }, 400);
      const key = newClientKey();
      const client: ClientRecord = { ...v.value, createdAt: now, keyHash: hashKey(key), status: "active" };
      await clientStore.save(client);
      return json({ ok: true, client: { ...client, keyHash: undefined }, key });
    }
    const c = clients.find((x) => x.id === body.id);
    if (!c) return json({ ok: false, error: "No such client." }, 404);
    if (body.action === "rotate") {
      const key = newClientKey();
      await clientStore.save({ ...c, keyHash: hashKey(key) });
      return json({ ok: true, key });
    }
    if (body.action === "pause" || body.action === "resume") {
      await clientStore.save({ ...c, status: body.action === "pause" ? "paused" : "active" });
      return json({ ok: true });
    }
    if (body.action === "update") {
      const v = validateClient({ label: body.label ?? c.label, slug: c.id, instagram: body.instagram ?? c.instagram ?? "" }, new Set());
      if (!v.ok) return json({ ok: false, error: v.error }, 400);
      await clientStore.save({ ...c, label: v.value.label, instagram: v.value.instagram });
      return json({ ok: true });
    }
    if (body.action === "remove") {
      await clientStore.remove(c.id);
      return json({ ok: true });
    }
    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("[station] clients", err);
    return json({ ok: false, error: "Store unavailable. Nothing was changed." }, 503);
  }
}
