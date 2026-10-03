// The full report as one self-contained HTML file: inline CSS, covers embedded as data URIs, no external requests.
// Tabs work with a few lines of inline script; without script every tab shows one after another. Server only.
import { fmt, fmtX } from "./analyze";
import { BUSINESS } from "./legal";
import { cleanCaption } from "./tagger";
import type { Report } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
:root{--bg:#f6f6f4;--surface:#fff;--ink:#000;--muted:#6d6e5e;--line:#d0d0c8;--good:#2f7a4b;--good-soft:#dde8d3;--bad:#b23a2c;--bad-soft:#f2ddd3;--cell:#e8e7d9}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:940px;margin:0 auto;padding:32px 16px 48px}
h1{font-size:30px;line-height:1.15;letter-spacing:-.02em;margin:0}
h2{font-size:15px;margin:0 0 12px}
h3{font-size:22px;margin:0 0 4px;letter-spacing:-.01em}
.head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:13px;color:var(--muted);padding-bottom:12px}
.head b{color:var(--ink)}
.tabs{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--line);margin-top:8px}
.tabs button{font:inherit;font-size:14px;font-weight:600;background:none;border:0;border-bottom:3px solid transparent;padding:12px 16px;color:var(--muted);cursor:pointer;white-space:nowrap}
.tabs button:hover{color:var(--ink)}
.tabs button[aria-selected=true]{color:var(--ink);border-bottom-color:var(--good)}
.tabs button:focus-visible{outline:2px solid var(--ink);outline-offset:-2px}
.js .panel[hidden]{display:none}
.panel{padding:24px 0}
.nojs-title{display:none}
html:not(.js) .nojs-title{display:block;font-size:20px;font-weight:700;margin:32px 0 0;border-top:2px solid var(--ink);padding-top:16px}
html:not(.js) .tabs{display:none}
section{border-top:1px solid var(--line);padding:24px 0}
.panel>section:first-child{border-top:2px solid var(--ink)}
.two{display:grid;gap:32px;grid-template-columns:1fr}
@media(min-width:720px){.two{grid-template-columns:1fr 1fr}.hero{grid-template-columns:1.2fr 1fr}}
dl{display:flex;flex-wrap:wrap;margin:20px 0 0}
dl div{padding:0 20px}dl div:first-child{padding-left:0}dl div+div{border-left:1px solid var(--line)}
dt{font-size:12px;color:var(--muted)}dd{margin:0;font-size:20px;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
.cell{aspect-ratio:1;display:grid;place-items:center;font-size:12px;font-weight:600;background:var(--cell);color:var(--muted)}
.cell.top{background:var(--good);color:#fff}.cell.bot{background:var(--bad);color:#fff}
.cell.up{background:var(--good-soft);color:var(--good)}.cell.down{background:var(--bad-soft);color:var(--bad)}
.note{font-size:12px;color:var(--muted);margin:8px 0 0}
.bar{display:grid;grid-template-columns:minmax(0,10rem) 1fr 3.5rem;gap:12px;align-items:center;margin-bottom:8px;font-size:13.5px}
.bar .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}.bar small{font-weight:400;color:var(--muted)}
.track{position:relative;height:12px}.fill{position:absolute;inset:0 auto 0 0}.mid{position:absolute;top:-6px;bottom:-6px;border-left:1.5px dashed var(--ink)}
.g{color:var(--good)}.r{color:var(--bad)}.bar .v{text-align:right}
ul.clips,ol.f{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.clip{display:grid;grid-template-columns:44px 1fr;gap:12px}
.cov{width:44px;aspect-ratio:9/16;background:var(--cell);border:2px solid var(--line);object-fit:cover;display:block}
.cov.g{border-color:var(--good)}.cov.r{border-color:var(--bad)}
.clip p{margin:0}.cap{font-size:14px;font-weight:600;line-height:1.35}.meta{font-size:13px;color:var(--muted);margin-top:2px!important}.why{font-size:13px;margin-top:4px!important}
ol.f{counter-reset:n;gap:12px}ol.f li{counter-increment:n;padding-left:22px;position:relative}ol.f li::before{content:counter(n)".";position:absolute;left:0;color:var(--muted)}
ol.f b{display:block;line-height:1.3}ol.f span{font-size:13.5px;color:var(--muted)}
.fix{border-left:4px solid var(--good);padding:6px 0 6px 12px;font-size:17px;font-weight:700;line-height:1.35;margin:0}
ul.then{margin:12px 0 0;padding-left:20px;font-size:13.5px;color:var(--muted)}
.target{border:1.5px solid var(--ink);padding:12px;margin-top:16px;font-size:13.5px}.target b{display:block;font-size:12px;color:var(--muted);font-weight:600}
.pending{border:1px dashed var(--line);background:var(--surface);padding:20px;color:var(--muted)}
.pending p{margin:6px 0 0}
footer{border-top:1px solid var(--line);margin-top:32px;padding-top:12px;font-size:12px;color:var(--muted)}
@media print{body{background:#fff}.tabs{display:none}.js .panel[hidden]{display:block}.nojs-title{display:block!important;font-size:20px;font-weight:700;margin:24px 0 0}}
`;

const SCRIPT = `
(function(){var d=document.documentElement;d.classList.add("js");
var t=[].slice.call(document.querySelectorAll('[role=tab]')),p=[].slice.call(document.querySelectorAll('[role=tabpanel]'));
function go(i,f){t.forEach(function(b,k){b.setAttribute("aria-selected",k==i);b.tabIndex=k==i?0:-1;p[k].hidden=k!=i});if(f)t[i].focus();try{history.replaceState(null,"","#"+t[i].dataset.k)}catch(e){}}
t.forEach(function(b,i){b.onclick=function(){go(i)};b.onkeydown=function(e){var n=e.key=="ArrowRight"?i+1:e.key=="ArrowLeft"?i-1:null;if(n!==null){e.preventDefault();go((n+t.length)%t.length,1)}}});
var h=location.hash.slice(1),s=t.findIndex(function(b){return b.dataset.k==h});go(s<0?0:s)})();
`;

const TABS = [
  ["Diagnosis", "diagnosis"],
  ["Profile", "profile"],
  ["Timing", "timing"],
  ["Competitors", "competitors"],
  ["Strategy", "strategy"],
] as const;

// The month-one pages that need data we don't hold yet are shown as pending, never as placeholder numbers.
const PENDING: Record<string, string> = {
  profile: "What a new visitor sees in the first 5 seconds on your profile: bio, link, pinned videos and grid.",
  timing: "Your best days and hours to post, from your own history, and what posting gaps have cost you.",
  competitors: "Three similar Malaysian accounts in your niche, compared on content type, format and posting rhythm.",
  strategy: "Your content restructured into clear pillars and named series you can repeat every week.",
};

export function renderReportHtml(r: Report): string {
  const max = Math.max(...r.pillars.map((p) => p.multiple), 1.5);
  const tone = (i: number) =>
    r.top.includes(i) ? "top" : r.bottom.includes(i) ? "bot" : r.multiples[i] >= 1.25 ? "up" : r.multiples[i] <= 0.75 ? "down" : "";

  const clip = (i: number, good: boolean) => {
    const v = r.videos[i];
    const title = esc(cleanCaption(v.title) || "(no caption)");
    const cover = v.cover?.startsWith("data:image/") ? `<img class="cov ${good ? "g" : "r"}" src="${esc(v.cover)}" alt="">` : `<span class="cov ${good ? "g" : "r"}"></span>`;
    return `<li class="clip">${cover}<div><p class="cap">${title}</p><p class="meta">${fmt(v.views)} views, <b class="${good ? "g" : "r"}">${fmtX(r.multiples[i])}</b>${v.date ? `, posted ${esc(v.date)}` : ""}</p>${v.why ? `<p class="why">${esc(v.why)}</p>` : ""}</div></li>`;
  };

  const diagnosis = `
<section class="two hero">
  <div>
    <h1>${esc(r.verdict)}</h1>
    <dl>
      <div><dt>Latest videos</dt><dd>${r.videos.length}</dd></div>
      <div><dt>Usual views</dt><dd>${fmt(r.median)}</dd></div>
      <div><dt>Best video</dt><dd>${fmtX(r.multiples[r.top[0]])}</dd></div>
    </dl>
  </div>
  <figure style="margin:0">
    <div class="grid">${r.videos.map((_, i) => `<div class="cell ${tone(i)}">${fmtX(r.multiples[i])}</div>`).join("")}</div>
    <figcaption class="note">One box, one video, newest at top left. Each number is views as a multiple of your usual. Solid boxes: the ${r.top.length} best and ${r.bottom.length} weakest.</figcaption>
  </figure>
</section>
<section>
  <h2>By content type</h2>
  ${r.pillars
    .map(
      (p) =>
        `<div class="bar"><span class="t">${esc(p.name)} <small>(${p.count})</small></span><div class="track"><div class="fill" style="width:${((p.multiple / max) * 100).toFixed(1)}%;background:var(${p.multiple >= 1 ? "--good" : "--bad"})"></div><div class="mid" style="left:${((1 / max) * 100).toFixed(1)}%"></div></div><span class="v ${p.multiple >= 1 ? "g" : "r"}">${fmtX(p.multiple)}</span></div>`,
    )
    .join("")}
  <p class="note">The dashed line is your usual views. A bar past the line means that type beats your usual.</p>
</section>
<section class="two">
  <div><h2 class="g">What worked</h2><ul class="clips">${r.top.map((i) => clip(i, true)).join("")}</ul></div>
  <div><h2 class="r">What sank</h2><ul class="clips">${r.bottom.map((i) => clip(i, false)).join("")}</ul></div>
</section>
<section class="two">
  <div><h2>What the pattern says</h2><ol class="f">${r.findings.map((f) => `<li><b>${esc(f.h)}</b><span>${esc(f.b)}</span></li>`).join("")}</ol></div>
  <div>
    <h2>Fix this first</h2>
    <p class="fix">${esc(r.fixFirst)}</p>
    <ul class="then">${r.fixThen.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    <p class="target"><b>30-day target</b>${esc(r.target.replace("{median}", fmt(r.median)))}</p>
  </div>
</section>`;

  const pending = (k: string, name: string) =>
    `<section><div class="pending"><h3>${name}</h3><p>${esc(PENDING[k])}</p><p>This section is prepared for your account in month one of monthly and is not in this copy yet.</p></div></section>`;

  const panels = TABS.map(
    ([name, k]) =>
      `<div class="nojs-title">${name}</div><div role="tabpanel" class="panel" id="p-${k}" aria-labelledby="t-${k}">${k === "diagnosis" ? diagnosis : pending(k, name)}</div>`,
  ).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Diagnosis for ${esc(r.handle)} | ${BUSINESS.name}</title>
<style>${CSS}</style>
</head>
<body>
<main>
  <header class="head"><b>${BUSINESS.name} diagnosis</b><span>${esc(r.handle)} on ${esc(r.platform)}, ${fmt(r.followers)} followers, ${esc(r.date)}</span></header>
  <div class="tabs" role="tablist" aria-label="Report sections">
    ${TABS.map(([name, k]) => `<button role="tab" id="t-${k}" data-k="${k}" aria-controls="p-${k}" aria-selected="false">${name}</button>`).join("")}
  </div>
  ${panels}
  <footer>${BUSINESS.name} | ${BUSINESS.site} | ${BUSINESS.email}</footer>
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}
