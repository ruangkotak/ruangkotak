// Drives the Station routes while the site runs on the stand-in Redis (tests/fake-upstash.mjs), so the Redis branch of
// lib/store.ts is exercised end to end. Not part of `npm test`: it needs a running dev server.
// Run:  node tests/redis-paths.mjs http://localhost:3125 local-preview-only http://127.0.0.1:3124
import assert from "node:assert/strict";

const [base, key, fake] = process.argv.slice(2);
const headers = { "x-station-key": key, "content-type": "application/json" };
const get = async (path) => (await fetch(base + path, { headers })).json();
const post = async (path, body) => {
  const res = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};
const step = (name) => console.log(`ok  ${name}`);

// The site really is on Redis, not its in-memory fallback.
const state = await get("/api/station/state");
assert.equal(state.infra.find((p) => p.id === "redis").status, "ok");
step("state answers and the Redis probe is ok");

// Clients: saved, listed back from the hash, updated.
assert.equal((await post("/api/station/clients", { action: "create", label: "Test Talent", category: "talent" })).ok, true);
assert.equal((await post("/api/station/clients", { action: "create", label: "Test Brand", category: "brand" })).ok, true);
assert.equal((await post("/api/station/clients", { action: "update", id: "test-talent", commission: "20" })).ok, true);
assert.equal((await post("/api/station/clients", { action: "job-add", id: "test-talent", brand: "Brand X", fee: "3000", date: "2026-11-05" })).ok, true);
assert.equal((await post("/api/station/clients", { action: "job-add", id: "test-talent", brand: "Brand Y", fee: "1000", date: "2026-11-06" })).ok, true);
let clients = (await get("/api/station/clients")).clients;
assert.deepEqual(clients.map((c) => c.id).sort(), ["test-brand", "test-talent"]);
const talent = clients.find((c) => c.id === "test-talent");
assert.equal(talent.commission, 20);
assert.equal(talent.jobs.length, 2);
step("clients: create, update, add jobs, list");

// invoices.md decides: a ticked line marks received, an unticked one clears it, a repeat writes nothing.
const ref = (j) => j.id.replace(/-/g, "").slice(0, 8);
const [a, b] = talent.jobs;
assert.equal((await post("/api/station/clients", { action: "jobs-sync", paid: [{ ref: ref(a), on: "2026-11-12" }], open: [ref(b)] })).changed, 1);
assert.equal((await post("/api/station/clients", { action: "jobs-sync", paid: [{ ref: ref(a), on: "2026-11-12" }], open: [ref(b)] })).changed, 0);
let jobs = (await get("/api/station/clients")).clients.find((c) => c.id === "test-talent").jobs;
assert.equal(jobs.find((j) => j.id === a.id).paidAt, "2026-11-11T16:00:00.000Z");
assert.equal(jobs.find((j) => j.id === b.id).paidAt, undefined);
assert.equal((await post("/api/station/clients", { action: "jobs-sync", paid: [], open: [ref(a)] })).changed, 1);
jobs = (await get("/api/station/clients")).clients.find((c) => c.id === "test-talent").jobs;
assert.equal(jobs.find((j) => j.id === a.id).paidAt, undefined);
step("talent jobs: paid, repeat, unticked");

// Asks: stored, listed oldest first, removed once the laptop has them.
assert.equal((await post("/api/station/asks", { text: "First test ask for the redis path" })).ok, true);
assert.equal((await post("/api/station/asks", { text: "Second test ask for the redis path" })).ok, true);
let asks = (await get("/api/station/asks")).asks;
assert.deepEqual(asks.map((x) => x.text), ["First test ask for the redis path", "Second test ask for the redis path"]);
assert.equal((await post("/api/station/asks", { ack: asks.map((x) => x.id) })).ok, true);
assert.deepEqual((await get("/api/station/asks")).asks, []);
step("asks: add, list in order, acknowledge");

// Done presses: a Needs me item is pressed, handed to the laptop once, and not again after it confirms.
assert.equal((await post("/api/station/beat", { kind: "gate", gate: "dm", account: "alanazizreview", waiting: 2, oldestAt: new Date(Date.now() - 3600_000).toISOString() })).ok, true);
const needs = (await get("/api/station/state")).needsMe;
const dm = needs.find((n) => n.key.startsWith("gate:dm:"));
assert.ok(dm?.clear, "the DM item can be cleared from the board");
assert.equal((await post("/api/station/done", { key: dm.key })).ok, true);
assert.equal((await get("/api/station/state")).needsMe.some((n) => n.key === dm.key), false);
let done = (await get("/api/station/done")).done;
assert.deepEqual(done.map((d) => d.key), [dm.key]);
assert.equal((await post("/api/station/done", { ack: [dm.key, "gate:brief:never-pressed"] })).ok, true);
assert.deepEqual((await get("/api/station/done")).done, []);
step("done: press, hand to laptop, confirm (mark applied)");

// Draft decisions: listed, decided, handed to the laptop once, and not again after it confirms.
const file = "2026-11-20/post.md";
assert.equal((await post("/api/station/drafts", { drafts: [{ file, day: "2026-11-20", title: "Test draft", status: "DRAFT", preview: "hello" }, { file: "agent/abc123", title: "Agent draft", status: "DRAFT", preview: "x", where: "Station/Drafts/x.md" }] })).stored, 2);
assert.equal((await get("/api/station/drafts")).drafts.length, 2);
assert.equal((await post("/api/station/drafts", { file, decision: "approve" })).ok, true);
assert.equal((await post("/api/station/drafts", { file: "agent/abc123", decision: "reject" })).ok, true);
assert.equal((await post("/api/station/drafts", { file: "2026-11-20/gone.md", decision: "approve" })).status, 404);
assert.deepEqual((await get("/api/station/drafts")).pending, { [file]: "approve", "agent/abc123": "reject" });
let decisions = (await get("/api/station/drafts?pending=1")).decisions;
assert.deepEqual(decisions.map((d) => [d.file, d.decision]).sort(), [["2026-11-20/post.md", "approve"], ["agent/abc123", "reject"]]);
assert.equal((await post("/api/station/drafts", { ack: [file] })).ok, true);
decisions = (await get("/api/station/drafts?pending=1")).decisions;
assert.deepEqual(decisions.map((d) => d.file), ["agent/abc123"]);
assert.equal((await post("/api/station/drafts", { ack: ["agent/abc123"] })).ok, true);
assert.deepEqual((await get("/api/station/drafts")).pending, {});
step("drafts: list, approve, reject, hand to laptop, confirm (mark applied)");

const seen = await (await fetch(fake + "/_seen")).json();
console.log("redis commands exercised:", seen.join(" "));
