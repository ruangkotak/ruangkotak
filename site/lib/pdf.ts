// The mini-diagnosis as a clean A4 PDF. Same numbers as the web report (lib/analyze.ts), laid out with pdf-lib so it
// runs on Vercel without a headless browser. Server only.
//
// Look: the "Visual" editorial style (styles.refero.design/style/d2c0ed7b-c649-4d77-91de-1bd69dd10a9e). Warm vellum
// page, light high-contrast serif for headings, monospace for everything else, 1px warm hairlines, flat surfaces (no
// shadows or gradients), and the yellow highlighter used as a short mark only, never behind text, at most 3 per page.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, setCharacterSpacing, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { fmt, fmtX } from "./analyze";
import { coverBytes } from "./covers";
import { BUSINESS } from "./legal";
import { cleanCaption } from "./tagger";
import type { Report } from "./types";
import { store } from "./store";

const W = 595.28;
const H = 841.89;
const M = 52;
const CW = W - M * 2;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
// The reference palette runs warm throughout. It has no good/bad colours, so the two signal colours are a deep olive
// and a brick red picked to sit in it; both carry white text.
const C = {
  vellum: hex("#f6f6f4"), // page
  paper: hex("#ffffff"), // cards
  ink: hex("#000000"),
  carbon: hex("#2c2c26"), // dark panel
  ash: hex("#d0d0c8"), // hairlines, card outlines
  lichen: hex("#6d6e5e"), // body copy, eyebrows
  sage: hex("#979886"), // footnotes, running header
  moss: hex("#aaab9c"), // big numerals
  bone: hex("#e8e7d9"), // neutral cells, bar tracks
  yellow: hex("#fff347"), // highlighter marks only
  good: hex("#4b5a26"),
  bad: hex("#9a3b22"),
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

// Fraunces Light stands in for the reference's custom editorial serif and IBM Plex Mono for its custom mono (the
// fallbacks the reference itself names). Files and OFL licences live in lib/fonts; next.config.ts traces them into the
// routes that render PDFs. Embedded whole: pdf-lib's subsetter drops glyphs from some fonts.
let fontFiles: Promise<Buffer[]> | undefined;
const loadFonts = () =>
  (fontFiles ??= Promise.all(
    ["Fraunces-Light.ttf", "IBMPlexMono-Regular.ttf", "IBMPlexMono-Medium.ttf"].map((f) => readFile(join(process.cwd(), "lib/fonts", f))),
  ));

// Rounded rectangle as an SVG path; drawSvgPath measures y downward from the point it is given (the top-left corner).
const roundRect = (w: number, h: number, r: number) =>
  `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;

export async function renderPdf(r: Report): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Mini-diagnosis for ${safe(r.handle)}`);
  doc.setAuthor(BUSINESS.name);
  doc.setCreator(BUSINESS.name);
  const [serifBytes, monoBytes, monoMedBytes] = await loadFonts();
  const serif = await doc.embedFont(serifBytes);
  const mono = await doc.embedFont(monoBytes);
  const monoMed = await doc.embedFont(monoMedBytes);
  // Tight tracking, as in the reference: the serif closes up at display sizes, the mono a little at body sizes.
  const track = (font: PDFFont) => (font === serif ? -0.035 : -0.03);

  const newPage = () => {
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.vellum });
    return p;
  };
  let page: PDFPage = newPage();
  let y = H - M;

  const widthOf = (t: string, font: PDFFont, size: number) => font.widthOfTextAtSize(t, size) + track(font) * size * t.length;
  // pdf-lib has no letter-spacing option, so set the PDF character spacing around each run of text.
  const put = (t: string, x: number, yy: number, size: number, font: PDFFont, color: RGB, p: PDFPage = page) => {
    p.pushOperators(setCharacterSpacing(track(font) * size));
    p.drawText(t, { x, y: yy, size, font, color });
    p.pushOperators(setCharacterSpacing(0));
  };
  const card = (x: number, top: number, w: number, h: number, o: { fill?: RGB; border?: RGB; r?: number } = {}) =>
    page.drawSvgPath(roundRect(w, h, o.r ?? 8), { x, y: top, color: o.fill, borderColor: o.border, borderWidth: o.border ? 0.75 : 0 });
  const mark = (x: number, yy: number, w = 96) => page.drawRectangle({ x, y: yy, width: w, height: 4, color: C.yellow });

  const wrap = (t: string, font: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of safe(t).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next, font, size) <= width || !line) line = next;
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
      page = newPage();
      y = H - M;
    }
  };
  type TextOpts = { x?: number; w?: number; size?: number; font?: PDFFont; color?: RGB; gap?: number; lead?: number };
  const measure = (t: string, o: TextOpts = {}) => {
    const { w = CW, size = 9, font = mono, lead = 1.5 } = o;
    return wrap(t, font, size, w).length * size * lead;
  };
  // Draws wrapped text and moves the cursor down; returns the baseline of the first line so callers can hang a marker on it.
  const text = (t: string, o: TextOpts = {}) => {
    const { x = M, w = CW, size = 9, font = mono, color = C.ink, gap = 0, lead = 1.5 } = o;
    const lines = wrap(t, font, size, w);
    need(lines.length * size * lead);
    const first = y - size * lead + size * 0.28;
    for (const l of lines) {
      y -= size * lead;
      put(l, x, y + size * 0.28, size, font, color);
    }
    y -= gap;
    return first;
  };
  const eyebrow = (t: string, x: number, yy: number, color = C.lichen) => put(safe(t).toUpperCase(), x, yy, 7, monoMed, color);
  // Sections are separated by space, not rules: a numbered mono eyebrow over a light serif headline.
  let section = 0;
  // `keep` is the room the heading needs below it: by default its first item, so a heading never sits alone at the foot
  // of a page; a short chart passes its full height so it is never split.
  const heading = (label: string, title: string, color = C.ink, keep = 90) => {
    need(keep + 76);
    y -= y === H - M ? 0 : 36;
    section += 1;
    eyebrow(`${String(section).padStart(2, "0")} - ${label}`, M, y - 7);
    y -= 14;
    text(title, { size: 21, font: serif, color, lead: 1.15, gap: 12 });
  };

  // Masthead
  put(BUSINESS.name.toUpperCase(), M, y - 9, 9, monoMed, C.ink);
  const meta = safe(`Mini-diagnosis / ${r.date}`).toUpperCase();
  put(meta, W - M - widthOf(meta, mono, 7.5), y - 8.5, 7.5, mono, C.lichen);
  y -= 18;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: C.ink });
  y -= 44;

  // Cover: who, the verdict at poster size, one highlighter mark under it
  eyebrow(`${r.handle} / ${r.platform} / ${fmt(r.followers)} followers`, M, y);
  y -= 10;
  text(r.verdict, { size: 30, font: serif, lead: 1.1, w: CW * 0.94, gap: 18 });
  mark(M, y);
  y -= 30;

  // Headline numbers as three flat white cards
  const stats: [string, string][] = [
    ["Latest videos", String(r.videos.length)],
    ["Usual views", fmt(r.median)],
    ["Best video", fmtX(r.multiples[r.top[0]])],
  ];
  const sw = (CW - 16) / 3;
  const sh = 78;
  need(sh);
  stats.forEach(([k, v], i) => {
    const x = M + i * (sw + 8);
    card(x, y, sw, sh, { fill: C.paper, border: C.ash });
    eyebrow(k, x + 14, y - 20);
    put(v, x + 14, y - sh + 18, 30, serif, C.ink);
  });
  y -= sh;

  // Box grid: one box per video, newest first
  heading("The grid", "Every video against your usual views");
  const cols = 9;
  const gap = 4;
  const cell = (CW - gap * (cols - 1)) / cols;
  const rows = Math.ceil(r.videos.length / cols);
  need(rows * (cell + gap) + 30);
  r.videos.forEach((_, i) => {
    const x = M + (i % cols) * (cell + gap);
    const top = y - Math.floor(i / cols) * (cell + gap);
    const best = r.top.includes(i);
    const worst = r.bottom.includes(i);
    card(x, top, cell, cell, { fill: best ? C.good : worst ? C.bad : C.bone, r: 3 });
    const label = fmtX(r.multiples[i]);
    const font = best || worst ? monoMed : mono;
    put(label, x + (cell - widthOf(label, font, 8.5)) / 2, top - cell / 2 - 3, 8.5, font, best || worst ? C.white : C.ink);
  });
  y -= rows * (cell + gap) + 4;
  text("One box per video, newest at top left. Each number is views as a multiple of your usual. Olive: the 3 best. Brick: the 3 weakest.", { size: 7.5, color: C.sage });

  // Content types
  heading("Content types", "By content type", C.ink, r.pillars.length * 20 + 36);
  const max = Math.max(...r.pillars.map((p) => p.multiple), 1.5);
  const barX = M + 170;
  const barW = CW - 170 - 50;
  r.pillars.forEach((p) => {
    need(24);
    y -= 20;
    put(safe(`${p.name} (${p.count})`), M, y, 8.5, mono, C.ink);
    const good = p.multiple >= 1;
    page.drawRectangle({ x: barX, y: y - 1, width: barW, height: 9, color: C.bone });
    page.drawRectangle({ x: barX, y: y - 1, width: Math.max(2, (p.multiple / max) * barW), height: 9, color: good ? C.good : C.bad });
    const mid = barX + (1 / max) * barW;
    page.drawLine({ start: { x: mid, y: y - 5 }, end: { x: mid, y: y + 12 }, thickness: 0.8, color: C.ink, dashArray: [2, 2] });
    const label = fmtX(p.multiple);
    put(label, W - M - widthOf(label, monoMed, 8.5), y, 8.5, monoMed, good ? C.good : C.bad);
  });
  y -= 10;
  text("The dashed line is your usual views. A bar past the line means that content type beats your usual.", { size: 7.5, color: C.sage });

  // Worked / sank
  // Each clip gets its 9:16 cover on the left in a thin signal-colour frame, with the caption and numbers beside it,
  // and a hairline between clips.
  const THUMB_W = 42;
  const THUMB_H = 75;
  const clip = async (i: number, good: boolean, first: boolean) => {
    const v = r.videos[i];
    const bytes = await coverBytes(v.cover);
    const img = bytes ? await doc.embedJpg(bytes).catch(() => null) : null;
    const x = img ? M + THUMB_W + 16 : M;
    const w = img ? CW - THUMB_W - 16 : CW;
    const t = cleanCaption(v.title) || "(no caption)";
    need(Math.max(56, img ? THUMB_H + 20 : 0));
    // Hairline between clips, but not at the top of a fresh page.
    if (!first && y !== H - M) {
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.ash });
      y -= 12;
    }
    const top = y;
    if (img) {
      page.drawRectangle({ x: M, y: top - THUMB_H, width: THUMB_W, height: THUMB_H, color: good ? C.good : C.bad });
      page.drawImage(img, { x: M + 1.5, y: top - THUMB_H + 1.5, width: THUMB_W - 3, height: THUMB_H - 3 });
    }
    y += 2;
    text(`${fmt(v.views)} views / ${fmtX(r.multiples[i])}${v.date ? ` / posted ${v.date}` : ""}`, { x, w, size: 8, font: monoMed, color: good ? C.good : C.bad, gap: 2 });
    text(t.length > 130 ? `${t.slice(0, 129).trimEnd()}...` : t, { x, w, size: 8.5, gap: v.why ? 2 : 0 });
    if (v.why) text(v.why, { x, w, size: 8, color: C.lichen });
    y -= 12;
    // Never let the next clip start inside the thumbnail.
    if (img) y = Math.min(y, top - THUMB_H - 12);
  };
  heading("What worked", "What worked", C.good);
  for (const [n, i] of r.top.entries()) await clip(i, true, n === 0);
  heading("What sank", "What sank", C.bad);
  for (const [n, i] of r.bottom.entries()) await clip(i, false, n === 0);

  // Caption signals read by TypeSafe (live reports only; hand-written ones carry none)
  const read = r.videos.filter((v) => v.reason !== undefined);
  if (read.length) {
    const withReason = read.filter((v) => (v.reason ?? 0) >= 0.5).length;
    const inSeries = read.filter((v) => (v.series ?? 0) >= 0.5).length;
    heading("Captions", "What your captions promise");
    text(
      `${withReason} of ${read.length} captions give the viewer a concrete reason to keep watching: a benefit, a problem, a question or a bold claim. ` +
        `${inSeries ? `${inSeries} mark the video as part of a series.` : "None mark the video as part of a series."}`,
      { size: 9, gap: 6 },
    );
    text("Each caption was read by a TypeSafe language model, which judged its content type and these two signals. The maths and the wording of this report are fixed rules applied to your own numbers.", { size: 7.5, color: C.sage });
  }

  // Findings: big light numerals in the margin, a serif headline, mono body, hairlines between
  heading("Diagnosis", "What the pattern says");
  r.findings.forEach((f, i) => {
    need(70);
    if (i) {
      y -= 4;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.ash });
      y -= 12;
    }
    const base = text(f.h, { x: M + 44, w: CW - 44, font: serif, size: 14, lead: 1.25, gap: 4 });
    put(String(i + 1).padStart(2, "0"), M, base - 4, 24, serif, C.moss);
    text(f.b, { x: M + 44, w: CW - 44, size: 8.5, color: C.lichen, gap: 10 });
  });

  // Fix this first: a white card with a highlighter mark, then the 30-day target as the one dark panel
  heading("Next", "Fix this first");
  const pad = 20;
  const inner = CW - pad * 2;
  const fixH = measure(r.fixFirst, { w: inner, size: 16, font: serif, lead: 1.25 });
  const thenH = r.fixThen.reduce((s, f) => s + measure(f, { w: inner - 18, size: 8.5 }) + 3, 0);
  const cardH = pad + 14 + fixH + 10 + thenH + pad - 6;
  need(cardH);
  card(M, y, CW, cardH, { fill: C.paper, border: C.ash });
  mark(M + pad, y - pad, 64);
  y -= pad + 10;
  text(r.fixFirst, { x: M + pad, w: inner, font: serif, size: 16, lead: 1.25, gap: 10 });
  r.fixThen.forEach((f) => {
    const base = text(f, { x: M + pad + 18, w: inner - 18, size: 8.5, color: C.lichen, gap: 3 });
    put("-", M + pad, base, 8.5, mono, C.lichen);
  });
  y -= pad - 6;

  y -= 12;
  const target = r.target.replace("{median}", fmt(r.median));
  const tH = measure(target, { w: inner, size: 10, lead: 1.5 }) + 46;
  need(tH);
  card(M, y, CW, tH, { fill: C.carbon });
  eyebrow("30-day target", M + pad, y - 24, C.moss);
  y -= 32;
  text(target, { x: M + pad, w: inner, size: 10, color: C.white });
  y -= 14;

  // Running header on later pages, footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    if (i) put(safe(`${BUSINESS.name} / ${r.handle}`).toUpperCase(), M, H - 34, 7, mono, C.sage, p);
    p.drawLine({ start: { x: M, y: M - 8 }, end: { x: W - M, y: M - 8 }, thickness: 0.6, color: C.ash });
    put(safe(`${BUSINESS.name} / ${BUSINESS.site}${BUSINESS.email ? ` / ${BUSINESS.email}` : ""}`), M, M - 20, 7, mono, C.sage, p);
    const pg = `${String(i + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
    put(pg, W - M - widthOf(pg, mono, 7), M - 20, 7, mono, C.sage, p);
  });

  return doc.save();
}

// Bump when the PDF layout or fonts change, so stored PDFs are re-rendered instead of served stale.
const PDF_VERSION = "v3";

// Rendering embeds the full fonts and takes a few seconds, so each report's PDF is made once and stored.
// A store failure never blocks the PDF: it is rendered and returned anyway.
export async function reportPdf(r: Report): Promise<Uint8Array> {
  const cached = await store.getPdf(r.id, PDF_VERSION).catch(() => null);
  if (cached) return cached;
  const pdf = await renderPdf(r);
  await store.savePdf(r.id, PDF_VERSION, pdf).catch((err) => console.error("[pdf-cache]", err));
  return pdf;
}
