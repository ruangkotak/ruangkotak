import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { decodePayload, replyFor, tapsIn, validSignature } from "../lib/ig-gate.ts";
import { gatePayload, PAYLOAD_PREFIX } from "../scripts/station/instagram.mts";
import { GATE_TEMPLATE, gateFrom } from "../scripts/station/jobs/ig-comment-dm.mts";
import { PAYLOAD_PREFIX as SERVER_PREFIX } from "../lib/ig-gate.ts";

const LINK = "Hi {username}! Here are the files: https://example.com/files";
const NUDGE = "Almost there! Follow @alanazizreview, then tap the button again and it's yours.";

test("gate file: off by default, read when filled in, refused when set up wrong", () => {
  assert.equal(gateFrom(GATE_TEMPLATE), null);
  const gate = gateFrom(`${GATE_TEMPLATE}First DM: Hey {username}! Tap below and I'll send you the speaker link 👇\nButton: Send me the link\nNot following: ${NUDGE}\n`);
  assert.deepEqual(gate, { first: "Hey {username}! Tap below and I'll send you the speaker link 👇", button: "Send me the link", nudge: NUDGE });
  assert.match(String(gateFrom("First DM: hi")), /Not following/);
  assert.match(String(gateFrom(`First DM: hi\nButton: ${"x".repeat(21)}\nNot following: follow`)), /20 characters/);
});

test("the laptop's button payload decodes on the server", () => {
  assert.equal(PAYLOAD_PREFIX, SERVER_PREFIX);
  assert.deepEqual(decodePayload(gatePayload(LINK, NUDGE, "Send me the link")), { link: LINK, nudge: NUDGE, button: "Send me the link" });
  assert.equal(decodePayload("SOMETHING_ELSE"), null);
  assert.equal(decodePayload(`${PAYLOAD_PREFIX}{broken`), null);
});

const event = (payload: string, sender = "111", mid = "m1") => ({
  object: "instagram",
  entry: [{ id: "999", messaging: [{ sender: { id: sender }, recipient: { id: "999" }, timestamp: 1, postback: { mid, title: "Send me the link", payload } }] }],
});

test("taps: ours are read, other buttons and the account's own taps are skipped", () => {
  const p = gatePayload(LINK, NUDGE, "Send me the link");
  assert.deepEqual(tapsIn(event(p)), [{ account: "999", sender: "111", mid: "m1", payload: { link: LINK, nudge: NUDGE, button: "Send me the link" } }]);
  assert.deepEqual(tapsIn(event("OTHER")), []);
  assert.deepEqual(tapsIn(event(p, "999")), []);
  assert.deepEqual(tapsIn({ nope: true }), []);
});

test("followers get the link, everyone else the nudge with the button again", () => {
  const [tap] = tapsIn(event(gatePayload(LINK, NUDGE, "Send me the link")));
  const yes = replyFor(tap, { username: "sam", is_user_follow_business: true });
  assert.equal(yes.follows, true);
  assert.deepEqual(yes.message, { text: "Hi @sam! Here are the files: https://example.com/files" });
  const no = replyFor(tap, { username: "sam", is_user_follow_business: false }) as { follows: boolean; message: any };
  assert.equal(no.follows, false);
  assert.equal(no.message.attachment.payload.text, NUDGE);
  const again = no.message.attachment.payload.buttons[0];
  assert.equal(again.title, "Send me the link");
  assert.deepEqual(decodePayload(again.payload), tap.payload);
  assert.equal(replyFor(tap, {}).follows, false); // unknown counts as not following
});

test("webhook signature", () => {
  const body = JSON.stringify(event("x"));
  const sig = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
  assert.equal(validSignature(body, sig, "secret"), true);
  assert.equal(validSignature(body + " ", sig, "secret"), false);
  assert.equal(validSignature(body, sig, undefined), false);
  assert.equal(validSignature(body, null, "secret"), false);
});
