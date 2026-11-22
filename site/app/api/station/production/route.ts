import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { applyWritten, reopen, saveDraft, sendToClient, startWriting, withBrief, type Production } from "@/lib/production";
import { dealLabel } from "@/lib/station";
import { json, ownerRequest } from "@/lib/station-live";
import { clientStore, prodStore } from "@/lib/store";

// Production on a brand job (Clients tab). Owner only; anyone else gets a 404.
//   GET              from the page: every production.
//   GET  ?pending=1  from the laptop (x-station-key): the jobs waiting for Claude to write the script.
//   POST { action, key | clientId+jobId, ... } from the page: brief, write, save, send, reopen, remove.
//   POST { action: "written", key, script, storyboard | failed } from the laptop: Claude's answer.
// KNOX never sends the review link: the owner copies it and sends it himself.

export async function GET(req: NextRequest) {
  if (!(await ownerRequest(req, false))) return new Response("Not found", { status: 404 });
  try {
    const all = await prodStore.all();
    if (req.nextUrl.searchParams.get("pending")) {
      const clients = await clientStore.all();
      const pending = all.filter((p) => p.stage === "writing").sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).map((p) => {
        const job = clients.find((c) => c.id === p.clientId)?.brandJobs?.find((j) => j.id === p.jobId);
        return { key: p.key, brand: p.brand, what: p.what, deal: job ? dealLabel(job.deal) : "Video", brief: p.brief, ...(p.clientNote ? { clientNote: p.clientNote } : {}) };
      });
      return json({ pending });
    }
    return json({ productions: all });
  } catch (err) {
    console.error("[station] production", err);
    return json({ error: "store unavailable" }, 503);
  }
}

export async function POST(req: NextRequest) {
  if (!(await ownerRequest(req, true))) return new Response("Not found", { status: 404 });
  const fromLaptop = !!req.headers.get("x-station-key");
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return json({ ok: false, error: "Missing action." }, 400);
  const now = new Date().toISOString();
  try {
    if (body.action === "brief") {
      const c = (await clientStore.all()).find((x) => x.id === body.clientId);
      const job = c?.brandJobs?.find((j) => j.id === body.jobId);
      if (!c || !job) return json({ ok: false, error: "That brand job is gone. Reload the page." }, 404);
      const r = withBrief((await prodStore.get(`${c.id}:${job.id}`)) ?? undefined, { clientId: c.id, jobId: job.id, brand: c.label, what: job.what }, body.brief, now);
      if (!r.ok) return json({ ok: false, error: r.error }, 400);
      // "Save and write" in one press.
      const next = body.write ? startWriting(r.value, now) : r;
      if (!next.ok) return json({ ok: false, error: next.error }, 400);
      await prodStore.save(next.value);
      return json({ ok: true, production: next.value });
    }

    const p = typeof body.key === "string" ? await prodStore.get(body.key) : null;
    if (!p) return json({ ok: false, error: "That job has no brief yet. Reload the page." }, 404);

    if (body.action === "written") {
      if (!fromLaptop) return json({ ok: false, error: "Only the laptop answers for Claude." }, 403);
      const next = applyWritten(p, body, now);
      if (next) await prodStore.save(next);
      return json({ ok: true, applied: !!next });
    }
    if (body.action === "remove") {
      await prodStore.remove([p.key]);
      return json({ ok: true });
    }
    const r: { ok: true; value: Production } | { ok: false; error: string } =
      body.action === "write" ? startWriting(p, now)
      : body.action === "save" ? saveDraft(p, body, now)
      : body.action === "send" ? sendToClient(p, randomBytes(18).toString("base64url"), now)
      : body.action === "reopen" ? reopen(p, now)
      : { ok: false, error: "Unknown action." };
    if (!r.ok) return json({ ok: false, error: r.error }, 400);
    await prodStore.save(r.value);
    return json({ ok: true, production: r.value });
  } catch (err) {
    console.error("[station] production", err);
    return json({ ok: false, error: "Store unavailable. Nothing was changed." }, 503);
  }
}
