import assert from "node:assert/strict";
import { test } from "node:test";

// FUNNEL_LIVE is read when lib/funnel.ts loads, so set it before the import.
process.env.NEXT_PUBLIC_FUNNEL_LIVE = "1";
const { previewOpen, withoutSample } = await import("../lib/funnel.ts");

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

test("a saved sample report is never served in production", () => {
  assert.equal(withoutSample({ mock: true }, { VERCEL_ENV: "production" }), null);
  assert.equal(withoutSample({ mock: true }, { VERCEL_ENV: "production", APIFY_TOKEN: "x" }), null);
});

test("a saved sample report is dropped once a scraper token is set, even outside production", () => {
  assert.equal(withoutSample({ mock: true }, { APIFY_TOKEN: "x" }), null);
});

test("sample reports still open locally and in preview review without a token", () => {
  const sample = { mock: true };
  assert.equal(withoutSample(sample, {}), sample);
  assert.equal(withoutSample(sample, { VERCEL_ENV: "preview" }), sample);
});

test("real reports and missing reports pass through untouched", () => {
  const real = { mock: false };
  assert.equal(withoutSample(real, { VERCEL_ENV: "production", APIFY_TOKEN: "x" }), real);
  assert.equal(withoutSample(null, { VERCEL_ENV: "production" }), null);
});
