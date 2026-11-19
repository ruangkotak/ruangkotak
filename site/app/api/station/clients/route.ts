import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { BRAND_JOBS_MAX, brandJob, brandJobFee, cleanJobSync, clientCategory, clientLogEntry, clientTerms, commissionOf, syncJobs, hashKey, newClientKey, onboarding, TALENT_JOBS_MAX, talentJob, validateClient, type ClientRecord } from "@/lib/station";
import { fileRegistry, json, ownerRequest } from "@/lib/station-live";
import { clientLog, clientStore, stationStore } from "@/lib/store";

// The Clients tab: list, add, rotate a link, pause, resume, update, remove. Owner only; anyone else gets a 404.
// A new or rotated key is returned once and never stored, only its hash. Writes made with the session cookie must come
// from Station's own page (Origin check), on top of the cookie being SameSite=Lax.


const view = (c: ClientRecord, runs: Awaited<ReturnType<typeof stationStore.runs>>, gates: Awaited<ReturnType<typeof stationStore.gates>>) => {
  const { keyHash: _, ...rest } = c;
  return { ...rest, steps: onboarding(c, runs, gates) };
};

export async function GET(req: NextRequest) {
  if (!(await ownerRequest(req, false))) return new Response("Not found", { status: 404 });
  const clients = await clientStore.all(); // always fresh: this is the list being edited
  const jobIds = clients.flatMap((c) => [`${c.id}-velocity`, `${c.id}-final-check`]);
  const [runs, gates] = await Promise.all([stationStore.runs(jobIds), stationStore.gates()]);
  return json({ clients: clients.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => view(c, runs, gates)), history: await clientLog.list() });
}

export async function POST(req: NextRequest) {
  if (!(await ownerRequest(req, true))) return new Response("Not found", { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return json({ ok: false, error: "Missing action." }, 400);
  const clients = await clientStore.all();
  const now = new Date().toISOString();
  const viaKey = !!req.headers.get("x-station-key");
  try {
    if (body.action === "create") {
      const taken = new Set([...fileRegistry.accounts.map((a) => a.id), ...clients.map((c) => c.id), ...fileRegistry.jobs.map((j) => j.id)]);
      const v = validateClient(body, taken);
      if (!v.ok) return json({ ok: false, error: v.error }, 400);
      const cat = clientCategory(body.category);
      if (!cat.ok) return json({ ok: false, error: cat.error }, 400);
      const key = newClientKey();
      const client: ClientRecord = { ...v.value, createdAt: now, keyHash: hashKey(key), status: "active", ...(cat.value ? { category: cat.value } : {}) };
      await clientStore.save(client);
      await clientLog.add(clientLogEntry("added", client, viaKey, now));
      return json({ ok: true, client: { ...client, keyHash: undefined }, key });
    }
    // The laptop reports which talent-job invoice lines are ticked in invoices.md: that file decides what is received.
    if (body.action === "jobs-sync") {
      const changed = syncJobs(clients, cleanJobSync(body), now);
      for (const x of changed) await clientStore.save(x);
      return json({ ok: true, changed: changed.length });
    }
    const c = clients.find((x) => x.id === body.id);
    if (!c) return json({ ok: false, error: "No such client." }, 404);
    if (body.action === "rotate") {
      const key = newClientKey();
      await clientStore.save({ ...c, keyHash: hashKey(key) });
      await clientLog.add(clientLogEntry("new link", c, viaKey, now));
      return json({ ok: true, key });
    }
    if (body.action === "pause" || body.action === "resume") {
      await clientStore.save({ ...c, status: body.action === "pause" ? "paused" : "active" });
      await clientLog.add(clientLogEntry(body.action === "pause" ? "paused" : "resumed", c, viaKey, now));
      return json({ ok: true });
    }
    if (body.action === "update") {
      const v = validateClient({ label: body.label ?? c.label, slug: c.id, instagram: body.instagram ?? c.instagram ?? "" }, new Set());
      if (!v.ok) return json({ ok: false, error: v.error }, 400);
      // Price and reels per month change only when the form sends them; a blank value clears it.
      const terms = clientTerms({ price: "price" in body ? body.price : c.price, perMonth: "perMonth" in body ? body.perMonth : c.perMonth });
      if (!terms.ok) return json({ ok: false, error: terms.error }, 400);
      // The category changes only when the form sends it; a blank value clears it.
      const cat = clientCategory("category" in body ? body.category : c.category);
      if (!cat.ok) return json({ ok: false, error: cat.error }, 400);
      const pct = commissionOf("commission" in body ? body.commission : c.commission);
      if (!pct.ok) return json({ ok: false, error: pct.error }, 400);
      await clientStore.save({ ...c, label: v.value.label, instagram: v.value.instagram, ...terms.value, category: cat.value, commission: pct.value });
      return json({ ok: true });
    }
    // Talent jobs: what a brand paid for one job, and our percentage of it. Kept on the client's own record.
    if (body.action === "job-add") {
      if (c.category !== "talent") return json({ ok: false, error: "Jobs are tracked for Talent only." }, 400);
      if ((c.jobs?.length ?? 0) >= TALENT_JOBS_MAX) return json({ ok: false, error: "That is a lot of jobs. Remove old ones first." }, 400);
      const j = talentJob(body, c.commission);
      if (!j.ok) return json({ ok: false, error: j.error }, 400);
      await clientStore.save({ ...c, jobs: [...(c.jobs ?? []), { id: randomUUID(), ...j.value }] });
      return json({ ok: true });
    }
    if (body.action === "job-remove") {
      if (!c.jobs?.some((j) => j.id === body.jobId)) return json({ ok: false, error: "No such job." }, 404);
      await clientStore.save({ ...c, jobs: c.jobs.filter((j) => j.id !== body.jobId) });
      return json({ ok: true });
    }
    // Brand jobs: the Onboarding department's category, fee and invoice steps for a brand offering a job.
    if (body.action === "brand-job-add") {
      if (c.category !== "brand") return json({ ok: false, error: "Brand jobs are for Brand clients only." }, 400);
      if ((c.brandJobs?.length ?? 0) >= BRAND_JOBS_MAX) return json({ ok: false, error: "That is a lot of jobs. Remove old ones first." }, 400);
      const j = brandJob(body);
      if (!j.ok) return json({ ok: false, error: j.error }, 400);
      await clientStore.save({ ...c, brandJobs: [...(c.brandJobs ?? []), { id: randomUUID(), ...j.value }] });
      return json({ ok: true });
    }
    if (body.action === "brand-job-fee") {
      const j = c.brandJobs?.find((x) => x.id === body.jobId);
      if (!j) return json({ ok: false, error: "No such job." }, 404);
      const fee = brandJobFee(j, body.fee);
      if (!fee.ok) return json({ ok: false, error: fee.error }, 400);
      await clientStore.save({ ...c, brandJobs: c.brandJobs!.map((x) => (x.id === j.id ? { ...x, fee: fee.value } : x)) });
      return json({ ok: true });
    }
    if (body.action === "brand-job-remove") {
      if (!c.brandJobs?.some((j) => j.id === body.jobId)) return json({ ok: false, error: "No such job." }, 404);
      await clientStore.save({ ...c, brandJobs: c.brandJobs.filter((j) => j.id !== body.jobId) });
      return json({ ok: true });
    }
    if (body.action === "remove") {
      await clientStore.remove(c.id);
      await clientLog.add(clientLogEntry("removed", c, viaKey, now));
      return json({ ok: true });
    }
    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("[station] clients", err);
    return json({ ok: false, error: "Store unavailable. Nothing was changed." }, 503);
  }
}
