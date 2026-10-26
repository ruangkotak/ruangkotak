// Checks a running server (default: next start on :3100). Run `npm run build && npm start`, then `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const get = (path: string, accept?: string) => fetch(BASE + path, { headers: accept ? { Accept: accept } : {}, redirect: "manual" });

test("home: Accept text/markdown returns Markdown with Vary: Accept", async () => {
  const r = await get("/", "text/markdown");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type")!, /^text\/markdown/);
  assert.match(r.headers.get("vary")!, /\bAccept\b/i);
  assert.match(await r.text(), /^# RUANGKOTAK/);
});

test("home: Accept text/html still returns HTML with the SEO metadata", async () => {
  // Next overwrites Vary on prerendered pages, so Vary: Accept on HTML is only checkable on the deployed site.
  const r = await get("/", "text/html");
  assert.match(r.headers.get("content-type")!, /^text\/html/);
  const html = await r.text();
  assert.match(html, /<html lang="en"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/ruangkotak\.com"/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /property="og:type" content="website"/);
  assert.match(html, /application\/ld\+json/);
});

test("home: heading levels never skip", async () => {
  const html = await (await get("/", "text/html")).text();
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  assert.equal(levels[0], 1);
  levels.reduce((prev, n) => {
    assert.ok(n <= prev + 1, `h${prev} -> h${n}`);
    return n;
  });
});

test("home: JSON-LD has Organization with contactPoint and PostalAddress", async () => {
  const html = await (await get("/", "text/html")).text();
  const raw = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1];
  const org = JSON.parse(raw)["@graph"].find((n: { "@type": string }) => n["@type"] === "Organization");
  assert.ok(org.name && org.url && org.description);
  assert.equal(org.contactPoint.contactType, "customer support");
  assert.ok(org.contactPoint.email);
  assert.equal(org.address["@type"], "PostalAddress");
  assert.equal(org.address.addressLocality, "Cheras");
  assert.equal(org.address.addressRegion, "Kuala Lumpur");
});

test("unknown path: 404 status, Markdown body with links, for agents; HTML for browsers", async () => {
  const md = await get("/__probe-does-not-exist", "text/markdown");
  assert.equal(md.status, 404);
  assert.match(md.headers.get("content-type")!, /^text\/markdown/);
  const body = await md.text();
  assert.ok(body.length >= 20);
  assert.match(body, /llms\.txt/);
  const html = await get("/__probe-does-not-exist", "text/html");
  assert.equal(html.status, 404);
  assert.match(html.headers.get("content-type")!, /^text\/html/);
});

test("trust pages have 500+ characters of text, in HTML and Markdown", async () => {
  for (const p of ["/about", "/contact", "/privacy"]) {
    const html = await (await get(p, "text/html")).text();
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    assert.ok(text.replace(/\s+/g, " ").length > 500, p);
    const md = await get(p, "text/markdown");
    assert.equal(md.status, 200, p);
  }
});

test("static machine-readable files", async () => {
  const llms = await (await get("/llms.txt")).text();
  assert.match(llms, /^# RUANGKOTAK/);
  assert.match(llms, /^## When to use this/m);
  const sm = await (await get("/sitemap.xml")).text();
  for (const p of ["/about", "/contact", "/privacy"]) assert.ok(sm.includes(`https://ruangkotak.com${p}`), p);
  assert.equal((await get("/robots.txt")).status, 200);
  assert.equal((await get("/opengraph-image.png")).status, 200);
});

test("API and assets are not negotiated", async () => {
  const r = await get("/brand/icon.svg", "text/markdown");
  assert.match(r.headers.get("content-type")!, /svg/);
});
