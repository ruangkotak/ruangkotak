import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FAQ, STEPS, homeJsonLd } from "../lib/site.ts";

const markup = readFileSync(new URL("../components/landing/markup.ts", import.meta.url), "utf8");

test("every FAQ question and answer in the JSON-LD is on the home page", () => {
  for (const [q, a] of FAQ) {
    assert.ok(markup.includes(`<button>${q}<i>`), `question missing from page: ${q}`);
    assert.ok(markup.includes(`<p>${a}</p>`), `answer missing from page: ${q}`);
  }
  const n = (markup.match(/<div class=\\"q\\">/g) ?? []).length;
  assert.equal(n, FAQ.length, "page and JSON-LD must list the same number of questions");
});

test("every HowTo step in the JSON-LD is on the home page, in order", () => {
  let at = -1;
  for (const [h, t] of STEPS) {
    const i = markup.indexOf(`<h3>${h}</h3><p>${t}</p>`);
    assert.ok(i > at, `step missing or out of order: ${h}`);
    at = i;
  }
});

test("graph has FAQPage and HowTo built from those lists", () => {
  const g = homeJsonLd()["@graph"] as { "@type": string; mainEntity?: unknown[]; step?: unknown[] }[];
  assert.equal(g.find((n) => n["@type"] === "FAQPage")!.mainEntity!.length, FAQ.length);
  assert.equal(g.find((n) => n["@type"] === "HowTo")!.step!.length, STEPS.length);
});
