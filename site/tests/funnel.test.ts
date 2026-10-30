import assert from "node:assert/strict";
import { test } from "node:test";

// FUNNEL_LIVE is read when lib/funnel.ts loads, so set it before the import.
process.env.NEXT_PUBLIC_FUNNEL_LIVE = "1";
const { previewOpen } = await import("../lib/funnel.ts");

test("preview stays closed in production without an Apify token", () => {
  assert.equal(previewOpen({ VERCEL_ENV: "production" }), false);
});

test("preview opens in production once the Apify token is set", () => {
  assert.equal(previewOpen({ VERCEL_ENV: "production", APIFY_TOKEN: "x" }), true);
});

test("preview still works in mock mode outside production", () => {
  assert.equal(previewOpen({}), true);
  assert.equal(previewOpen({ VERCEL_ENV: "preview" }), true);
});
