// Carousel studio: turns a script and product photos into Instagram carousel slides (1080 × 1350 PNG).
// Everything is drawn in the browser. Photos, words and the PNGs never leave the device: nothing here talks to a server.

export const W = 1080;
export const H = 1350;
export const MAX_SLIDES = 8;

export type Palette = { name: string; bg: string; line: string; ink: string; acc: string };
export const PALETTES: Record<string, Palette> = {
  cream: { name: "Cream", bg: "#F4EFE4", line: "#CFC4AB", ink: "#1B1B18", acc: "#E4572E" },
  lemon: { name: "Lemon", bg: "#F6E64B", line: "#D2C22B", ink: "#16170F", acc: "#16170F" },
  mint: { name: "Mint", bg: "#CFEFDB", line: "#9BD0B1", ink: "#10261A", acc: "#0B7A4B" },
  lilac: { name: "Lilac", bg: "#E3D7F7", line: "#BDA9E6", ink: "#1E1533", acc: "#6B3FD4" },
  cobalt: { name: "Cobalt", bg: "#1747B5", line: "#4D78E0", ink: "#FFFFFF", acc: "#FFD84A" },
  ink: { name: "Ink", bg: "#12130E", line: "#34362A", ink: "#ECEBDF", acc: "#E9E24C" },
};
export const BACKGROUNDS = [["grid", "Graph paper"], ["dots", "Dot grid"], ["blueprint", "Blueprint"], ["cross", "Crosshatch"], ["glow", "Glow grid"]] as const;
export type Background = (typeof BACKGROUNDS)[number][0];

export type Slide = { kind: "cover" | "body" | "end"; head: string; body: string; img: number | null };
export type Deck = { bg: Background; pal: string; handle: string; slides: Slide[] };

const FONT = '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
const rgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Pure: slides from a script, one line per slide. The first line is the cover, the last the end page, at most 8 in all. */
export function slidesFrom(script: string, handle: string): Slide[] {
  const lines = script.split("\n").map((l) => l.trim()).filter((l) => l && !/^avoid:/i.test(l)).map((l) => l.replace(/^[A-Z ]{2,12}:\s*/, "")).filter(Boolean);
  const head = lines[0] ?? "Your hook goes here";
  const end = lines.length > 1 ? lines[lines.length - 1] : "Follow for more";
  const mid = lines.slice(1, -1).slice(0, MAX_SLIDES - 2);
  return [
    { kind: "cover", head: cap(head), body: "", img: null },
    ...mid.map((t): Slide => ({ kind: "body", head: cap(t), body: "", img: null })),
    { kind: "end", head: cap(end), body: handle ? `Follow ${handle} for more` : "", img: null },
  ];
}

/** Pure: a first-draft caption from the slides. A starting point to rewrite, not finished copy. */
export function captionFrom(slides: Slide[]): string {
  const body = slides.filter((s) => s.kind === "body").map((s) => `→ ${s.head}`).join("\n");
  return [slides[0]?.head, body, slides.at(-1)?.head].filter(Boolean).join("\n\n");
}

/** Pure: gives each slide without a photo the next unused one, in order. The end page is left clean. */
export function assignPhotos(slides: Slide[], count: number): Slide[] {
  const out = slides.map((s) => (s.img !== null && s.img >= count ? { ...s, img: null } : s));
  let next = 0;
  for (const s of out) {
    if (s.img !== null || s.kind === "end") continue;
    while (next < count && out.some((q) => q.img === next)) next++;
    if (next < count) s.img = next++;
  }
  return out;
}

function background(x: CanvasRenderingContext2D, type: Background, p: Palette, i: number) {
  x.fillStyle = p.bg;
  x.fillRect(0, 0, W, H);
  const lines = (step: number, width: number, a: number) => {
    x.strokeStyle = rgba(p.line, a);
    x.lineWidth = width;
    x.beginPath();
    for (let v = 0; v <= W; v += step) { x.moveTo(v, 0); x.lineTo(v, H); }
    for (let v = 0; v <= H; v += step) { x.moveTo(0, v); x.lineTo(W, v); }
    x.stroke();
  };
  if (type === "grid") { lines(54, 1.5, 0.7); lines(270, 3.5, 1); }
  if (type === "dots") {
    x.fillStyle = p.line;
    for (let a = 54; a < W; a += 54) for (let b = 54; b < H; b += 54) { x.beginPath(); x.arc(a, b, a % 270 === 0 && b % 270 === 0 ? 7 : 3.6, 0, 7); x.fill(); }
  }
  if (type === "blueprint") {
    lines(27, 1, 0.45); lines(135, 2, 0.9);
    x.strokeStyle = rgba(p.acc, 0.9); x.lineWidth = 3;
    for (let a = 270; a < W; a += 270) for (let b = 270; b < H; b += 270) { x.beginPath(); x.moveTo(a - 16, b); x.lineTo(a + 16, b); x.moveTo(a, b - 16); x.lineTo(a, b + 16); x.stroke(); }
    x.strokeStyle = p.line; x.lineWidth = 2.5; x.beginPath(); x.arc(i % 2 ? 150 : W - 150, H - 260 - (i % 3) * 120, 330, 0, 7); x.stroke();
    x.fillStyle = p.line; for (let b = 0; b < H; b += 27) x.fillRect(0, b, b % 135 === 0 ? 30 : 14, 2);
  }
  if (type === "cross") {
    x.strokeStyle = rgba(p.line, 0.75); x.lineWidth = 2; x.beginPath();
    for (let v = -H; v < W + H; v += 72) { x.moveTo(v, 0); x.lineTo(v + H, H); x.moveTo(v, 0); x.lineTo(v - H, H); }
    x.stroke();
  }
  if (type === "glow") {
    for (const [fx, fy] of [[i % 2 ? 0.15 : 0.85, 0.12], [i % 2 ? 0.9 : 0.1, 0.78]]) {
      const g = x.createRadialGradient(fx * W, fy * H, 0, fx * W, fy * H, 720);
      g.addColorStop(0, rgba(p.acc, 0.42)); g.addColorStop(1, rgba(p.acc, 0));
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    lines(54, 1.5, 0.6); lines(270, 3, 0.9);
    const f = x.createLinearGradient(0, H * 0.55, 0, H);
    f.addColorStop(0, rgba(p.bg, 0)); f.addColorStop(1, rgba(p.bg, 0.85));
    x.fillStyle = f; x.fillRect(0, 0, W, H);
  }
}

function wrap(x: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (x.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Draws text that shrinks until it fits `maxLines`, and returns the y below it. */
function text(x: CanvasRenderingContext2D, value: string, left: number, y: number, maxW: number, maxLines: number, size: number, min: number, weight: number, color: string, leading = 1.12) {
  if (!value) return y;
  let lines: string[];
  for (;;) {
    x.font = `${weight} ${size}px ${FONT}`;
    lines = wrap(x, value, maxW);
    if (lines.length <= maxLines || size <= min) break;
    size -= 4;
  }
  x.fillStyle = color;
  x.textBaseline = "top";
  lines.slice(0, maxLines).forEach((l, k) => x.fillText(l, left, y + k * size * leading));
  return y + Math.min(lines.length, maxLines) * size * leading;
}

function photo(x: CanvasRenderingContext2D, img: HTMLImageElement, bx: number, by: number, bw: number, bh: number, p: Palette) {
  x.fillStyle = p.acc; x.beginPath(); x.roundRect(bx + 16, by + 16, bw, bh, 34); x.fill();
  x.save(); x.beginPath(); x.roundRect(bx, by, bw, bh, 34); x.clip();
  const s = Math.max(bw / img.width, bh / img.height), w = img.width * s, h = img.height * s;
  x.drawImage(img, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
  x.restore();
  x.strokeStyle = p.ink; x.lineWidth = 5; x.beginPath(); x.roundRect(bx, by, bw, bh, 34); x.stroke();
}

function pill(x: CanvasRenderingContext2D, label: string, right: number, y: number, p: Palette, solid: boolean) {
  x.font = `700 30px ${FONT}`;
  const w = x.measureText(label).width + 56, left = right - w;
  x.beginPath(); x.roundRect(left, y, w, 62, 31);
  if (solid) { x.fillStyle = p.ink; x.fill(); } else { x.strokeStyle = p.ink; x.lineWidth = 3; x.stroke(); }
  x.fillStyle = solid ? p.bg : p.ink; x.textBaseline = "middle"; x.fillText(label, left + 28, y + 32);
  return left;
}

/** Draws slide `i` of the deck onto a 1080 × 1350 canvas. */
export function drawSlide(canvas: HTMLCanvasElement, deck: Deck, i: number, photos: HTMLImageElement[]) {
  const x = canvas.getContext("2d");
  const s = deck.slides[i];
  if (!x || !s) return;
  const p = PALETTES[deck.pal] ?? PALETTES.cream, M = 84, img = s.img === null ? undefined : photos[s.img];
  background(x, deck.bg, p, i);
  x.fillStyle = p.ink; x.font = `700 30px ${FONT}`; x.textBaseline = "top";
  x.fillText(deck.handle, M, 62);
  const count = `${i + 1}/${deck.slides.length}`;
  x.fillText(count, W - M - x.measureText(count).width, 62);
  let y = 170;
  if (s.kind === "end") {
    y = img ? 170 : 330;
    x.fillStyle = p.acc; x.fillRect(M, y, 170, 14);
    y = text(x, s.head, M, y + 44, W - 2 * M, 4, 104, 60, 800, p.ink);
    y = text(x, s.body, M, y + 30, W - 2 * M, 4, 46, 34, 500, rgba(p.ink, 0.85), 1.3);
    if (img && H - 230 - (y + 50) > 200) photo(x, img, M, y + 50, W - 2 * M - 16, H - 230 - (y + 50), p);
    let right = W - M;
    for (const label of ["Follow", "Share", "Save"]) right = pill(x, label, right, H - 150, p, label === "Follow") - 18;
    return;
  }
  if (s.kind === "body") {
    x.fillStyle = p.acc; x.beginPath(); x.arc(M + 46, y + 46, 46, 0, 7); x.fill();
    const num = String(i).padStart(2, "0");
    x.fillStyle = p.bg; x.font = `800 44px ${FONT}`; x.textBaseline = "middle"; x.fillText(num, M + 46 - x.measureText(num).width / 2, y + 48);
    y += 130;
  } else {
    x.fillStyle = p.acc; x.fillRect(M, y, 170, 14);
    y += 44;
  }
  y = text(x, s.head, M, y, W - 2 * M, s.kind === "cover" ? 4 : 3, s.kind === "cover" ? 108 : 80, 52, 800, p.ink);
  y = text(x, s.body, M, y + 26, W - 2 * M, 4, 44, 32, 500, rgba(p.ink, 0.85), 1.3);
  if (img && H - 230 - (y + 50) > 200) photo(x, img, M, y + 50, W - 2 * M - 16, H - 230 - (y + 50), p);
  pill(x, "Swipe  →", W - M, H - 150, p, true);
}

/** Pure: a plain zip (stored, no compression: PNGs are already compressed) of the given files. */
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (d: Uint8Array) => { let c = -1; for (let i = 0; i < d.length; i++) c = table[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = new TextEncoder().encode(f.name), sum = crc(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(12, 33, true); local.setUint32(14, sum, true);
    local.setUint32(18, f.data.length, true); local.setUint32(22, f.data.length, true); local.setUint16(26, name.length, true);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(14, 33, true); dir.setUint32(16, sum, true);
    dir.setUint32(20, f.data.length, true); dir.setUint32(24, f.data.length, true); dir.setUint16(28, name.length, true); dir.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of all) { out.set(b, at); at += b.length; }
  return out;
}
