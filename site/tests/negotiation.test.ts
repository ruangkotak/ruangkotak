import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownResponseFor, prefersMarkdown } from "../lib/site.ts";

test("prefersMarkdown: agents yes, browsers no", () => {
  assert.equal(prefersMarkdown("text/markdown"), true);
  assert.equal(prefersMarkdown("text/markdown, text/html;q=0.9"), true);
  assert.equal(prefersMarkdown("text/html, text/markdown;q=0.5"), false);
  assert.equal(prefersMarkdown("text/markdown;q=0"), false);
  assert.equal(prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"), false);
  assert.equal(prefersMarkdown("*/*"), false);
  assert.equal(prefersMarkdown(null), false);
});

test("markdownResponseFor: known pages are 200, unknown are a useful 404", () => {
  for (const p of ["/", "/about", "/contact", "/privacy", "/about/"]) {
    const r = markdownResponseFor(p);
    assert.equal(r.status, 200, p);
    assert.match(r.body, /^# /);
  }
  const nf = markdownResponseFor("/nope");
  assert.equal(nf.status, 404);
  assert.ok(nf.body.length > 20);
  assert.match(nf.body, /llms\.txt/);
  assert.match(nf.body, /sitemap\.xml/);
});

test("404 markdown does not echo markup-breaking characters", () => {
  assert.doesNotMatch(markdownResponseFor("/a`b\nc").body, /a`b/);
});
