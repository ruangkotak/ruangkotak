// The mini-diagnosis as a clean A4 PDF. Same numbers as the web report (lib/analyze.ts), laid out with pdf-lib so it
// runs on Vercel without a headless browser. Server only.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fmt, fmtX } from "./analyze";
import { coverBytes } from "./covers";
import { BUSINESS } from "./legal";
import { cleanCaption } from "./tagger";
import type { Report } from "./types";
import { store } from "./store";

const W = 595.28;
const H = 841.89;
const M = 48;
const CW = W - M * 2;
const C = {
  ink: rgb(0.059, 0.075, 0.09),
  muted: rgb(0.32, 0.36, 0.4),
  line: rgb(0.83, 0.85, 0.87),
  good: rgb(0.043, 0.478, 0.392),
  bad: rgb(0.745, 0.184, 0.29),
  cell: rgb(0.93, 0.94, 0.95),
  white: rgb(1, 1, 1),
};

// Keep Latin-1 plus the typographic quotes, dashes and ellipsis both embedded fonts carry; drop anything else
// (emoji, other scripts) rather than print empty boxes.
const safe = (s: string) =>
  s
    .replace(/\u2192/g, "->")
    .replace(/[\s\u2028\u2029]+/g, " ")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Same as the site: Inter Regular for headings and body, as the open-licence stand-in for SF Pro
// (Apple's licence doesn't allow embedding SF Pro in a distributed PDF).
// The file and its OFL licence live in lib/fonts; next.config.ts traces them into the routes that render PDFs.
let fontFile: Promise<Buffer> | undefined;
const loadFont = () => (fontFile ??= readFile(join(process.cwd(), "lib/fonts/Inter-Regular.ttf")));

export async function renderPdf(r: Report): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Mini-diagnosis for ${safe(r.handle)}`);
  doc.setAuthor(BUSINESS.name);
  doc.setCreator(BUSINESS.name);
  // Inter is embedded whole: pdf-lib's subsetter drops most of its glyphs.
  const reg = await doc.embedFont(await loadFont());
  const display = reg;

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const wrap = (t: string, font: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of safe(t).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const need = (h: number) => {
    if (y - h < M + 24) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  // Draws wrapped text and moves the cursor down; returns the top of the first line so callers can hang a marker on it.
  const text = (t: string, o: { x?: number; w?: number; size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number; lead?: number } = {}) => {
    const { x = M, w = CW, size = 10.5, font = reg, color = C.ink, gap = 0, lead = 1.38 } = o;
    const lines = wrap(t, font, size, w);
    need(lines.length * size * lead);
    const baseline = y - size * lead + size * 0.28;
    for (const l of lines) {
      y -= size * lead;
      page.drawText(l, { x, y: y + size * 0.28, size, font, color });
    }
    y -= gap;
    return baseline;
  };
  const rule = (weight = 0.6, color = C.line) => {
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: weight, color });
  };
  const heading = (t: string, color = C.ink) => {
    // Room for the heading plus its first item, so a heading never sits alone at the foot of a page.
    need(100);
    y -= 18;
    rule();
    y -= 6;
    text(t, { size: 13.5, font: display, color, gap: 6 });
  };

  // Header
  page.drawText(BUSINESS.name, { x: M, y: y - 10, size: 11, font: reg, color: C.ink });
  const meta = safe(`Mini-diagnosis | ${r.handle} on ${r.platform} | ${fmt(r.followers)} followers | ${r.date}`);
  page.drawText(meta, { x: W - M - reg.widthOfTextAtSize(meta, 8.5), y: y - 9, size: 8.5, font: reg, color: C.muted });
  y -= 22;
  rule(1.6, C.ink);
  y -= 10;

  // Verdict + headline numbers
  text(r.verdict, { size: 22, font: display, gap: 10, lead: 1.22 });
  const stats: [string, string][] = [
    ["Latest videos", String(r.videos.length)],
    ["Usual views", fmt(r.median)],
    ["Best video", fmtX(r.multiples[r.top[0]])],
  ];
  need(40);
  stats.forEach(([k, v], i) => {
    const x = M + i * 130;
    page.drawText(k, { x, y: y - 8, size: 8, font: reg, color: C.muted });
    page.drawText(v, { x, y: y - 27, size: 17, font: reg, color: C.ink });
  });
  y -= 40;

  // Box grid: one box per video, newest first
  heading("Every video against your usual views");
  const cols = 9;
  const gap = 3;
  const cell = (CW - gap * (cols - 1)) / cols;
  const rows = Math.ceil(r.videos.length / cols);
  need(rows * (cell + gap) + 30);
  r.videos.forEach((_, i) => {
    const x = M + (i % cols) * (cell + gap);
    const top = y - Math.floor(i / cols) * (cell + gap);
    const best = r.top.includes(i);
    const worst = r.bottom.includes(i);
    page.drawRectangle({ x, y: top - cell, width: cell, height: cell, color: best ? C.good : worst ? C.bad : C.cell });
    const label = fmtX(r.multiples[i]);
    const f = reg;
    page.drawText(label, { x: x + (cell - f.widthOfTextAtSize(label, 8.5)) / 2, y: top - cell / 2 - 3, size: 8.5, font: f, color: best || worst ? C.white : C.ink });
  });
  y -= rows * (cell + gap) + 2;
  text("One box per video, newest at top left. Each number is views as a multiple of your usual. Green: the 3 best. Red: the 3 weakest.", { size: 8, color: C.muted });

  // Content types
  heading("By content type");
  const max = Math.max(...r.pillars.map((p) => p.multiple), 1.5);
  const barX = M + 150;
  const barW = CW - 150 - 46;
  for (const p of r.pillars) {
    need(20);
    y -= 15;
    page.drawText(safe(`${p.name} (${p.count})`), { x: M, y, size: 9.5, font: reg, color: C.ink });
    const good = p.multiple >= 1;
    page.drawRectangle({ x: barX, y: y - 1, width: Math.max(2, (p.multiple / max) * barW), height: 9, color: good ? C.good : C.bad });
    page.drawLine({ start: { x: barX + (1 / max) * barW, y: y - 4 }, end: { x: barX + (1 / max) * barW, y: y + 11 }, thickness: 0.9, color: C.ink, dashArray: [2, 2] });
    const label = fmtX(p.multiple);
    page.drawText(label, { x: W - M - reg.widthOfTextAtSize(label, 9.5), y, size: 9.5, font: reg, color: good ? C.good : C.bad });
  }
  y -= 4;
  text("The dashed line is your usual views. A bar past the line means that content type beats your usual.", { size: 8, color: C.muted });

  // Worked / sank
  // Each clip gets its 9:16 cover on the left (green or red frame), with the caption and numbers beside it.
  const THUMB_W = 40;
  const THUMB_H = 71;
  const clip = async (i: number, good: boolean) => {
    const v = r.videos[i];
    const bytes = await coverBytes(v.cover);
    const img = bytes ? await doc.embedJpg(bytes).catch(() => null) : null;
    const x = img ? M + THUMB_W + 12 : M;
    const w = img ? CW - THUMB_W - 12 : CW;
    const t = cleanCaption(v.title) || "(no caption)";
    need(Math.max(48, img ? THUMB_H + 8 : 0));
    const top = y;
    if (img) {
      page.drawRectangle({ x: M, y: top - THUMB_H, width: THUMB_W, height: THUMB_H, color: good ? C.good : C.bad });
      page.drawImage(img, { x: M + 1.5, y: top - THUMB_H + 1.5, width: THUMB_W - 3, height: THUMB_H - 3 });
    }
    text(t.length > 130 ? `${t.slice(0, 129).trimEnd()}...` : t, { x, w, font: reg, size: 9.5, gap: 1 });
    text(`${fmt(v.views)} views, ${fmtX(r.multiples[i])}${v.date ? `, posted ${v.date}` : ""}`, { x, w, size: 9, color: good ? C.good : C.bad, gap: v.why ? 1 : 7 });
    if (v.why) text(v.why, { x, w, size: 9, color: C.muted, gap: 7 });
    // Never let the next clip start inside the thumbnail.
    if (img) y = Math.min(y, top - THUMB_H - 8);
  };
  heading("What worked", C.good);
  for (const i of r.top) await clip(i, true);
  heading("What sank", C.bad);
  for (const i of r.bottom) await clip(i, false);

  // Caption signals read by TypeSafe (live reports only; hand-written ones carry none)
  const read = r.videos.filter((v) => v.reason !== undefined);
  if (read.length) {
    const withReason = read.filter((v) => (v.reason ?? 0) >= 0.5).length;
    const inSeries = read.filter((v) => (v.series ?? 0) >= 0.5).length;
    heading("What your captions promise");
    text(
      `${withReason} of ${read.length} captions give the viewer a concrete reason to keep watching: a benefit, a problem, a question or a bold claim. ` +
        `${inSeries ? `${inSeries} mark the video as part of a series.` : "None mark the video as part of a series."}`,
      { size: 10, gap: 4 },
    );
    text("Each caption was read by a TypeSafe language model, which judged its content type and these two signals. The maths and the wording of this report are fixed rules applied to your own numbers.", { size: 8, color: C.muted });
  }

  // Findings + fix
  heading("What the pattern says");
  r.findings.forEach((f, i) => {
    need(50);
    const base = text(f.h, { x: M + 16, w: CW - 16, font: display, size: 11.5, gap: 1 });
    page.drawText(`${i + 1}.`, { x: M, y: base, size: 11.5, font: display, color: C.muted });
    text(f.b, { x: M + 16, w: CW - 16, size: 9.5, color: C.muted, gap: 8 });
  });

  heading("Fix this first");
  need(70);
  const start = y;
  text(r.fixFirst, { x: M + 12, w: CW - 12, font: reg, size: 12.5, gap: 4, lead: 1.3 });
  page.drawRectangle({ x: M, y, width: 3.5, height: start - y, color: C.good });
  y -= 4;
  r.fixThen.forEach((f) => text(`-  ${f}`, { x: M + 8, w: CW - 8, size: 9.5, color: C.muted, gap: 2 }));
  y -= 6;
  const tl = wrap(r.target.replace("{median}", fmt(r.median)), reg, 10, CW - 20);
  const boxH = tl.length * 14 + 26;
  need(boxH + 10);
  page.drawRectangle({ x: M, y: y - boxH, width: CW, height: boxH, borderColor: C.ink, borderWidth: 1.2 });
  page.drawText("30-DAY TARGET", { x: M + 10, y: y - 15, size: 7.5, font: reg, color: C.muted });
  tl.forEach((l, i) => page.drawText(l, { x: M + 10, y: y - 30 - i * 14, size: 10, font: reg, color: C.ink }));
  y -= boxH + 6;

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.5, color: C.line });
    p.drawText(`${BUSINESS.name} | ${BUSINESS.site} | ${BUSINESS.email}`, { x: M, y: M - 18, size: 7.5, font: reg, color: C.muted });
    const pg = `${i + 1} / ${pages.length}`;
    p.drawText(pg, { x: W - M - reg.widthOfTextAtSize(pg, 7.5), y: M - 18, size: 7.5, font: reg, color: C.muted });
  });

  return doc.save();
}

// Bump when the PDF layout or fonts change, so stored PDFs are re-rendered instead of served stale.
const PDF_VERSION = "v3";

// Rendering embeds the full Inter font and takes a few seconds, so each report's PDF is made once and stored.
// A store failure never blocks the PDF: it is rendered and returned anyway.
export async function reportPdf(r: Report): Promise<Uint8Array> {
  const cached = await store.getPdf(r.id, PDF_VERSION).catch(() => null);
  if (cached) return cached;
  const pdf = await renderPdf(r);
  await store.savePdf(r.id, PDF_VERSION, pdf).catch((err) => console.error("[pdf-cache]", err));
  return pdf;
}
