import assert from "node:assert/strict";
import { test } from "node:test";
import { alanBlanks, applyWritten, clientReply, clientView, prodNeedsMe, reopen, saveDraft, sendToClient, splitWritten, startWriting, withBrief, writerPrompt, type Production } from "../lib/production.ts";

const T = "2026-11-23T01:00:00.000Z";
const base = { clientId: "acer", jobId: "j1", brand: "Acer", what: "Swift Go 14 review" };
const BRIEF = "Acer Swift Go 14. Show battery life, OLED screen, weight 1.3 kg. Deadline 5 Dec. RM500 fee agreed.";
const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }) => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return (r as { ok: true; value: T }).value;
};
const fresh = () => ok(withBrief(undefined, base, BRIEF, T));
const written = () => applyWritten(ok(startWriting(fresh(), T)), { script: "Hook A\nLine", storyboard: "1. Close-up" }, T)!;

test("a brief starts a production; too short is refused", () => {
  const p = fresh();
  assert.equal(p.key, "acer:j1");
  assert.equal(p.stage, "brief");
  assert.equal(withBrief(undefined, base, "too short", T).ok, false);
});

test("the full happy path: brief → writing → review → client → approved", () => {
  let p = written();
  assert.equal(p.stage, "review");
  p = ok(saveDraft(p, { script: "My edit", storyboard: "1. Wide" }, T));
  p = ok(sendToClient(p, "tok_aaaaaaaaaaaaaaaaaaaa", T));
  assert.equal(p.stage, "client");
  assert.equal(p.token, "tok_aaaaaaaaaaaaaaaaaaaa");
  p = ok(clientReply(p, "approve", "", T));
  assert.equal(p.stage, "approved");
});

test("a late laptop answer never overwrites Alan's edits", () => {
  const p = written();
  assert.equal(applyWritten(p, { script: "other" }, T), null);
});

test("a failed write keeps the old script and says why", () => {
  const first = applyWritten(ok(startWriting(fresh(), T)), { failed: "timed out" }, T)!;
  assert.equal(first.stage, "brief");
  assert.equal(first.failed, "timed out");
  const rewrite = applyWritten(ok(startWriting(written(), T)), { failed: "timed out" }, T)!;
  assert.equal(rewrite.stage, "review");
  assert.equal(rewrite.script, "Hook A\nLine");
});

test("the brief and script lock while the client has the link", () => {
  const p = ok(sendToClient(written(), "tok_aaaaaaaaaaaaaaaaaaaa", T));
  assert.equal(withBrief(p, base, BRIEF + " more", T).ok, false);
  assert.equal(saveDraft(p, { script: "x" }, T).ok, false);
  assert.equal(startWriting(p, T).ok, false);
});

test("the client can flag facts only with a note; sending again keeps the same link", () => {
  let p = ok(sendToClient(written(), "tok_aaaaaaaaaaaaaaaaaaaa", T));
  assert.equal(clientReply(p, "changes", "", T).ok, false);
  p = ok(clientReply(p, "changes", "Battery is 7 h, not 6 h", T));
  assert.equal(p.stage, "changes");
  assert.equal(clientReply(p, "approve", "", T).ok, false, "no second answer until it is sent again");
  p = ok(sendToClient(ok(saveDraft(p, { script: "fixed", storyboard: "" }, T)), "tok_bbbbbbbbbbbbbbbbbbbb", T));
  assert.equal(p.token, "tok_aaaaaaaaaaaaaaaaaaaa");
  assert.equal(p.clientNote, undefined);
});

test("the client view never carries the brief, the fee or Alan's draft in progress", () => {
  const sent = ok(sendToClient(written(), "tok_aaaaaaaaaaaaaaaaaaaa", T));
  const v = clientView(sent);
  assert.equal(v.state, "waiting");
  assert.ok(!JSON.stringify(v).includes("RM500"));
  assert.ok(!("brief" in v) && !("token" in v) && !("key" in v));
  const back = ok(reopen(sent, T));
  assert.deepEqual(clientView(back), { brand: "Acer", what: "Swift Go 14 review", script: "", storyboard: "", state: "closed" });
});

test("Claude's answer splits into notes, script and storyboard; notes never reach the client", () => {
  assert.deepEqual(splitWritten("NOTES FOR ALAN\nHook 2 is my pick\n\nSCRIPT\nHello\n\nSTORYBOARD\n1. Shot"), { notes: "Hook 2 is my pick", script: "Hello", storyboard: "1. Shot" });
  assert.deepEqual(splitWritten("Sure, here it is.\n## SCRIPT\nHello\n**STORYBOARD**\n1. Shot"), { notes: "Sure, here it is.", script: "Hello", storyboard: "1. Shot" });
  assert.deepEqual(splitWritten("Just a script"), { script: "Just a script", storyboard: "", notes: "" });
  const p = applyWritten(ok(startWriting(fresh(), T)), { script: "S", storyboard: "B", notes: "Hook options" }, T)!;
  assert.equal(p.notes, "Hook options");
  assert.ok(!JSON.stringify(clientView(ok(sendToClient(p, "tok_aaaaaaaaaaaaaaaaaaaa", T)))).includes("Hook options"));
});

test("Needs me shows only the steps waiting on Alan", () => {
  const sent = ok(sendToClient(written(), "tok_aaaaaaaaaaaaaaaaaaaa", T));
  const writing = ok(startWriting(fresh(), T));
  const lines = prodNeedsMe([fresh(), writing, written(), sent, ok(clientReply(sent, "approve", "", T))] as Production[]);
  assert.deepEqual(lines.map((l) => l.title), [
    "Write the script for Swift Go 14 review",
    "Check the script for Swift Go 14 review",
    "Acer approved Swift Go 14 review: record it",
  ]);
  assert.ok(lines.every((l) => l.stage === "make"));
});

test("the writer prompt keeps the verdict Alan's and fences the brief as data", () => {
  const s = writerPrompt(fresh(), "Paid review", "");
  assert.match(s, /\[ALAN'S VERDICT AFTER TESTING\]/);
  assert.match(s, /\[TO CONFIRM\]/);
  assert.match(s, /Instagram & TikTok/);
  assert.ok(s.indexOf("<<<BRIEF") < s.indexOf(BRIEF));
  assert.ok(!s.includes("FLAGGED"));
  assert.match(writerPrompt({ ...fresh(), clientNote: "Weight is 1.24 kg" }, "Paid", ""), /<<<FLAGGED\nWeight is 1.24 kg\nFLAGGED>>>/);
});

test("blanks for Alan are counted; questions for the brand are not", () => {
  assert.equal(alanBlanks("[ALAN'S VERDICT AFTER TESTING]\n[WHAT ALAN NOTICED]\n[TO CONFIRM] nits\n[SCALE READING]"), 2);
});

test("a brief file can be a PDF or a text file, nothing else", async () => {
  const { briefFileKind } = await import("../lib/production.ts");
  assert.equal(briefFileKind("Acer brief.PDF", ""), "pdf");
  assert.equal(briefFileKind("brief", "application/pdf"), "pdf");
  assert.equal(briefFileKind("brief.md", ""), "text");
  assert.equal(briefFileKind("notes", "text/plain"), "text");
  assert.equal(briefFileKind("brief.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), null);
  assert.equal(briefFileKind("photo.jpg", "image/jpeg"), null);
});

test("PDF text keeps its lines and pages, squeezes the spacing", async () => {
  const { joinPdfText, BRIEF_MAX } = await import("../lib/production.ts");
  const out = joinPdfText([
    [{ str: "Acer   Swift Go 14", hasEOL: true }, { str: "Battery:" }, { str: " " }, { str: "12 h", hasEOL: true }, {}],
    [],
    [{ str: "Deadline 5 Dec", hasEOL: true }, { str: "", hasEOL: true }, { str: "", hasEOL: true }, { str: "", hasEOL: true }, { str: "Do not mention price" }],
  ]);
  assert.equal(out, "Acer Swift Go 14\nBattery: 12 h\n\nDeadline 5 Dec\n\nDo not mention price");
  assert.equal(joinPdfText([[{ str: "x".repeat(BRIEF_MAX + 50) }]]).length, BRIEF_MAX);
  assert.equal(joinPdfText([[], [{ str: "   " }]]), "");
});
