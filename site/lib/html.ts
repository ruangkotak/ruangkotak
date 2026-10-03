// The full report as one self-contained HTML file: inline CSS, covers embedded as data URIs, no external requests.
// Tabs work with a few lines of inline script; without script every tab shows one after another. Server only.
import { fmt, fmtX } from "./analyze";
import { WORDMARK_D } from "../components/logo-paths";
import { BUSINESS } from "./legal";
import { cleanCaption } from "./tagger";
import type { Report } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
:root{--bg:#f6f6f4;--paper:#fff;--ink:#000;--carbon:#2c2c26;--line:#d0d0c8;--muted:#8d8e7c;--olive:#4a5a26;--brick:#9e3a22;--bone:#e8e7d9;--hi:#fff347}
*{box-sizing:border-box;margin:0}
html{background:var(--bg);-webkit-font-smoothing:antialiased}
body{font:400 13px/1.55 "IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;color:var(--ink);padding:0 16px}
.sheet{max-width:760px;margin:0 auto;padding:44px 0 28px}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--ink)}
.logo{height:28px;width:auto;color:var(--ink);display:block}
.tag,.eyebrow,.label,.foot{text-transform:uppercase;letter-spacing:.02em;font-size:10.5px;color:var(--muted)}
.eyebrow{margin-top:34px}
h1,h2,h3,.big,.n,.head2{font-family:Fraunces,Georgia,"Times New Roman",serif;font-weight:300}
h1{font-size:clamp(34px,6.4vw,52px);line-height:1.04;letter-spacing:-.025em;margin-top:16px}
.rule{width:134px;height:6px;background:var(--hi);margin:30px 0 36px}
.tabs{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--line);margin-top:20px}
.tabs button{font:inherit;font-size:11px;text-transform:uppercase;letter-spacing:.04em;background:none;border:0;border-bottom:3px solid transparent;padding:12px 14px;color:var(--muted);cursor:pointer;white-space:nowrap}
.tabs button:hover{color:var(--ink)}
.tabs button[aria-selected=true]{color:var(--ink);border-bottom-color:var(--hi)}
.tabs button:focus-visible{outline:2px solid var(--ink);outline-offset:-2px}
.js .panel[hidden]{display:none}
.nojs-title{display:none}
html:not(.js) .nojs-title{display:block;margin-top:44px;border-top:1px solid var(--ink);padding-top:14px;font-size:11px;text-transform:uppercase;color:var(--muted)}
html:not(.js) .tabs{display:none}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.stat{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 20px 16px}
.stat .big{font-size:38px;line-height:1.1;margin-top:12px;letter-spacing:-.02em}
section{margin-top:56px}
section>.label{display:block}
h2{font-size:clamp(26px,4.4vw,34px);letter-spacing:-.025em;line-height:1.1;margin:6px 0 24px}
h2.k{color:var(--olive)}h2.b{color:var(--brick)}
.grid{display:grid;grid-template-columns:repeat(9,1fr);gap:6px}
.cell{aspect-ratio:1;border-radius:8px;background:var(--bone);display:grid;place-items:center;font-size:12px;min-width:0}
.cell.k{background:var(--olive);color:#fff}.cell.b{background:var(--brick);color:#fff}
.note{color:var(--muted);font-size:11px;margin-top:14px}
.brow{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,2.4fr) 52px;align-items:center;gap:14px;padding:5px 0}
.track{height:10px;background:var(--bone);position:relative;display:block}
.track i{position:absolute;left:0;top:0;bottom:0;display:block}
.track i.k{background:var(--olive)}.track i.b{background:var(--brick)}
.track u{position:absolute;top:-8px;bottom:-8px;border-left:1px dashed var(--ink)}
.brow b{font-weight:400;text-align:right}b.k{color:var(--olive)}b.b{color:var(--brick)}
.vid{display:grid;grid-template-columns:60px 1fr;gap:22px;padding:18px 0;border-bottom:1px solid var(--line)}
.vid:last-child{border-bottom:0}
.thumb{width:60px;aspect-ratio:9/16;object-fit:cover;display:block;border:1.5px solid;background:var(--bone)}
.thumb.k{border-color:var(--olive)}.thumb.b{border-color:var(--brick)}
.meta{font-size:11.5px}.meta.k{color:var(--olive)}.meta.b{color:var(--brick)}
.cap{margin-top:3px}.why{color:var(--muted);font-size:12px;margin-top:3px}
ol{list-style:none;padding:0}
ol li{display:grid;grid-template-columns:62px 1fr;gap:0 4px;padding:16px 0;border-bottom:1px solid var(--line)}
ol li:last-child{border-bottom:0}
.n{font-size:34px;color:#b9baa9;line-height:1}
ol h3{font-size:20px;letter-spacing:-.02em;line-height:1.2}
ol p{color:var(--muted);font-size:12px;margin-top:10px}
.fix{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:26px 28px 22px}
.fix .bar{width:88px;height:5px;background:var(--hi);margin-bottom:20px}
.fix .head2{font-size:24px;line-height:1.25;letter-spacing:-.02em}
.fix ul{margin:18px 0 0;padding:0;list-style:none;color:var(--muted);font-size:12px}
.fix li{display:grid;grid-template-columns:24px 1fr;margin-top:6px}
.target{background:var(--carbon);color:#f6f6f4;border-radius:14px;padding:22px 28px;margin-top:12px}
.target .label{color:#a9a999;margin-bottom:10px;display:block}
.pending{background:var(--paper);border:1px dashed var(--line);border-radius:14px;padding:26px 28px;margin-top:44px}
.pending h2{margin:6px 0 12px}.pending p{color:var(--muted);font-size:12px;margin-top:8px}
.tip{color:var(--muted);font-size:10.5px;margin-top:40px}
.foot{display:flex;justify-content:space-between;gap:16px;margin-top:14px;padding-top:14px;border-top:1px solid var(--line);font-size:10px}
@media(max-width:560px){.stats{grid-template-columns:1fr}.grid{gap:4px}.cell{font-size:9.5px;border-radius:5px}.brow{grid-template-columns:1fr 52px}.brow .track{grid-column:1/-1;grid-row:2}.vid{grid-template-columns:48px 1fr;gap:14px}.thumb{width:48px}ol li{grid-template-columns:48px 1fr}header{flex-wrap:wrap}}
@media print{@page{size:A4;margin:14mm}html,body{background:var(--bg);-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{padding-top:0}section,.vid,ol li{break-inside:avoid}.tabs,.tip{display:none}.js .panel[hidden]{display:block}.nojs-title{display:block;margin-top:44px;border-top:1px solid var(--ink);padding-top:14px;font-size:11px;text-transform:uppercase;color:var(--muted)}}
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
  const tone = (i: number) => (r.top.includes(i) ? "k" : r.bottom.includes(i) ? "b" : "");

  const clip = (i: number, good: boolean) => {
    const v = r.videos[i];
    const t = good ? "k" : "b";
    const cap = cleanCaption(v.title) || "(no caption)";
    const img = v.cover?.startsWith("data:image/") ? `<img class="thumb ${t}" alt="" src="${esc(v.cover)}">` : `<span class="thumb ${t}"></span>`;
    return `<article class="vid">${img}<div><p class="meta ${t}">${fmt(v.views)} views / ${fmtX(r.multiples[i])}${v.date ? ` / posted ${esc(v.date)}` : ""}</p><p class="cap">${esc(cap.length > 130 ? `${cap.slice(0, 129).trimEnd()}...` : cap)}</p>${v.why ? `<p class="why">${esc(v.why)}</p>` : ""}</div></article>`;
  };

  const diagnosis = `
<p class="eyebrow">${esc(r.handle)} / ${esc(r.platform)} / ${fmt(r.followers)} followers</p>
<h1>${esc(r.verdict)}</h1>
<div class="rule"></div>
<div class="stats">
  <div class="stat"><span class="label">Latest videos</span><div class="big">${r.videos.length}</div></div>
  <div class="stat"><span class="label">Usual views</span><div class="big">${fmt(r.median)}</div></div>
  <div class="stat"><span class="label">Best video</span><div class="big">${fmtX(r.multiples[r.top[0]])}</div></div>
</div>
<section>
  <span class="label">01 - The grid</span>
  <h2>Every video against your usual views</h2>
  <div class="grid">${r.videos.map((_, i) => `<div class="cell ${tone(i)}">${fmtX(r.multiples[i])}</div>`).join("")}</div>
  <p class="note">One box per video, newest at top left. Each number is views as a multiple of your usual. Olive: the ${r.top.length} best. Brick: the ${r.bottom.length} weakest.</p>
</section>
<section>
  <span class="label">02 - Content types</span>
  <h2>By content type</h2>
  ${r.pillars
    .map((p) => {
      const t = p.multiple >= 1 ? "k" : "b";
      return `<div class="brow"><span>${esc(p.name)} (${p.count})</span><span class="track"><i class="${t}" style="width:${((p.multiple / max) * 100).toFixed(1)}%"></i><u style="left:${((1 / max) * 100).toFixed(1)}%"></u></span><b class="${t}">${fmtX(p.multiple)}</b></div>`;
    })
    .join("")}
  <p class="note">The dashed line is your usual views. A bar past the line means that content type beats your usual.</p>
</section>
<section>
  <span class="label">03 - What worked</span>
  <h2 class="k">What worked</h2>
  ${r.top.map((i) => clip(i, true)).join("")}
</section>
<section>
  <span class="label">04 - What sank</span>
  <h2 class="b">What sank</h2>
  ${r.bottom.map((i) => clip(i, false)).join("")}
</section>
<section>
  <span class="label">05 - Diagnosis</span>
  <h2>What the pattern says</h2>
  <ol>${r.findings.map((f, i) => `<li><span class="n">${String(i + 1).padStart(2, "0")}</span><div><h3>${esc(f.h)}</h3><p>${esc(f.b)}</p></div></li>`).join("")}</ol>
</section>
<section>
  <span class="label">06 - Next</span>
  <h2>Fix this first</h2>
  <div class="fix"><div class="bar"></div>
    <p class="head2">${esc(r.fixFirst)}</p>
    <ul>${r.fixThen.map((f) => `<li><span>-</span><span>${esc(f)}</span></li>`).join("")}</ul>
  </div>
  <div class="target"><span class="label">30-day target</span>${esc(r.target.replace("{median}", fmt(r.median)))}</div>
</section>`;

  const pending = (k: string, name: string) =>
    `<div class="pending"><span class="label">${name}</span><h2>Prepared in month one of monthly</h2><p>${esc(PENDING[k])}</p><p>This section is built for your account in month one of monthly and is not in this copy yet.</p></div>`;

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
<main class="sheet">
  <header>
    <svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 -300 8378.41 1629.41" role="img" aria-label="RUANGKOTAK"><g transform="scale(10.29)"><path fill="currentColor" d="M0 32H44V56H68V100H0Z"/><rect fill="currentColor" x="76" y="0" width="24" height="24"/></g><g transform="translate(1276.41 1029.41)"><path fill="currentColor" d="${WORDMARK_D}"/></g></svg>
    <span class="tag">Diagnosis / ${esc(r.date)}</span>
  </header>
  <div class="tabs" role="tablist" aria-label="Report sections">
    ${TABS.map(([name, k]) => `<button role="tab" id="t-${k}" data-k="${k}" aria-controls="p-${k}" aria-selected="false">${name}</button>`).join("")}
  </div>
  ${panels}
  <p class="tip">Need a PDF? Print this page and choose Save as PDF.</p>
  <footer class="foot"><span>${BUSINESS.name} / ${BUSINESS.site} / ${BUSINESS.email}</span></footer>
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}
