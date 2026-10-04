// RUANGKOTAK showreel, 15 s. A creator's three jobs (ideas, strategy, execution) end in burnout; diagnosis fixes it.
// Every frame is a pure function of time: window.draw(t) paints second t. Layout adapts to ?w=&h= (9:16 or 16:9).
(() => {
const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1080), H = +(q.get('h') || 1920);
const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');
const u = Math.min(W, H) / 1080, LAND = W > H, CX = W / 2, DIAG = Math.hypot(W, H);
const M = (LAND ? 100 : 70) * u;

// Site palette (site/app/globals.css, light theme). Yellow is a highlighter, red means trouble, green means fixed.
const C = {
  bg: '#f6f6f4', surface: '#ffffff', ink: '#000000', carbon: '#2c2c26', muted: '#6d6e5e', line: '#d0d0c8',
  tag: '#e8e7d9', mark: '#fff347', good: '#2f7a4b', goodSoft: '#dde8d3', bad: '#b23a2c', badSoft: '#f2ddd3',
};

// Stage = the box scenes play in; HUD above, captions below.
const HUDY = (LAND ? 92 : 150) * u;
const CAPY = LAND ? H - 92 * u : H - 250 * u;
const CAPPX = (LAND ? 60 : 74) * u;
const ST = LAND ? { cx: CX, cy: 505 * u, hw: 820 * u, hh: 330 * u } : { cx: CX, cy: 860 * u, hw: 470 * u, hh: 540 * u };

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  inOutExpo: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inCubic: x => x * x * x,
  inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outBack: (x, k = 1.70158) => 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2),
};
// damped spring 0 -> 1, d = seconds since release
const spring = (d, f = 2.2, k = 6.5) => d <= 0 ? 0 : 1 - Math.exp(-k * d) * Math.cos(2 * Math.PI * f * d);
// decaying wobble around 0
const wobble = (d, f = 3, k = 9) => d <= 0 ? 0 : Math.exp(-k * d) * Math.sin(2 * Math.PI * f * d);
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const noise = (t, s) => Math.sin(t * 13.1 + s * 7.3) * .5 + Math.sin(t * 29.7 + s * 3.1) * .3 + Math.sin(t * 51.3 + s * 11.9) * .2;
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); t = clamp(t); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; };
const lerpRect = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
// piecewise-linear keyframes [[t, v], ...]
const keys = (k, t) => { if (t <= k[0][0]) return k[0][1]; for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], seg(t, k[i - 1][0], k[i][0])); return k[k.length - 1][1]; };

// ---------- drawing helpers ----------
function font(w, px, track = 0) { ctx.font = `${w} ${px}px I`; ctx.letterSpacing = `${track * px}px`; }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); }
function shadow(on, blur = 24, dy = 10, a = .12) {
  if (on) { ctx.shadowColor = `rgba(0,0,0,${a})`; ctx.shadowBlur = blur * u; ctx.shadowOffsetY = dy * u; }
  else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
}
function fitFont(w, txt, maxPx, maxW, track = 0) { font(w, maxPx, track); const tw = ctx.measureText(txt).width; if (tw > maxW) font(w, maxPx * maxW / tw, track); return Math.min(maxPx, maxPx * maxW / tw); }
// Text line that rises out of a mask; p 0..1 in, out 0..1 slides up and away
function rise(txt, x, y, px, p, out, color, align = 'left') {
  if (p <= 0 || out >= 1) return;
  ctx.save(); ctx.beginPath(); ctx.rect(-1e5, y - px * 1.05, 2e5, px * 1.4); ctx.clip();
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(txt, x, y + (1 - p) * px * 1.3 - out * px * 1.3);
  ctx.restore();
}
// stroke a path progressively: p 0..1 of approx length L
function drawOn(path, L, p, color, lw) {
  if (p <= 0) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash([L, L]); ctx.lineDashOffset = L * (1 - p); ctx.stroke(path); ctx.restore();
}

// ---------- persistent cast ----------
const R = rng(20261005);
const NS = (LAND ? 150 : 170) * u; // sticky note size
const IDEAS = ['hook?', 'POV: …', '3 sebab', 'GRWM', 'trend #4', 'collab?', 'day in life', 'Q&A', 'storytime', 'tutorial', 'review', 'behind scenes', 'reply vid', 'series?'];
const NOTE_COLS = [C.mark, C.surface, C.tag, C.goodSoft, C.badSoft];
const GCOLS = 7, GROWS = 4, GHEAD = (LAND ? 52 : 64) * u;
const CW = 2 * ST.hw / GCOLS, CH = (2 * ST.hh - GHEAD) / GROWS;
const cellXY = k => [ST.cx - ST.hw + (k % GCOLS + .5) * CW, ST.cy - ST.hh + GHEAD + (Math.floor(k / GCOLS) + .5) * CH];
const CELL_NS = Math.min(CW, CH) * .78;
const cells = [...Array(GCOLS * GROWS).keys()].sort(() => R() - .5);
const NOTES = IDEAS.map((txt, i) => {
  const a = i * 2.399963 + R() * .4, rf = .55 + R() * .42;
  const x = clamp(ST.cx + Math.cos(a) * ST.hw * rf, ST.cx - ST.hw + NS * .55, ST.cx + ST.hw - NS * .55);
  const y = clamp(ST.cy + Math.sin(a) * ST.hh * rf, ST.cy - ST.hh + NS * .55, ST.cy + ST.hh - NS * .55);
  return { txt, x, y, rot: (R() - .5) * .44, col: NOTE_COLS[i % 5], cell: cells[i], crot: (R() - .5) * .1, ph: R() * 6.28 };
});
// tangled strings through the calendar notes, sampled once
const STRING = (() => {
  const order = NOTES.map((n, i) => i).sort(() => R() - .5), pts = [];
  for (let k = 0; k < order.length - 1; k++) {
    const [ax, ay] = cellXY(NOTES[order[k]].cell), [bx, by] = cellXY(NOTES[order[k + 1]].cell);
    const mx = (ax + bx) / 2 + (R() - .5) * ST.hw * .9, my = (ay + by) / 2 + (R() - .5) * ST.hh * .9;
    for (let s = 0; s < 24; s++) { const v = s / 24; pts.push([(1 - v) * (1 - v) * ax + 2 * (1 - v) * v * mx + v * v * bx, (1 - v) * (1 - v) * ay + 2 * (1 - v) * v * my + v * v * by]); }
  }
  return { order, pts };
})();
const CLIPS = Array.from({ length: 12 }, (_, i) => ({ w: (40 + R() * 110), c: [C.carbon, C.mark, C.good, C.muted, C.bad, C.tag][i % 6] }));
const CLIP_LEN = CLIPS.reduce((s, c) => s + c.w + 6, 0);
const PINGS = [[7.95, 'Post due · 9:00 PM', C.bad], [8.3, '128 comments unreplied', C.ink], [8.6, 'Edit 3 reels by Friday', C.ink],
  [8.85, 'Reach −32% this week', C.bad], [9.08, 'Trend ends tonight', C.ink], [9.28, 'Brand wants a deck', C.ink], [9.46, 'Film tomorrow’s hook', C.bad]];
const FALL = Array.from({ length: 8 }, () => ({ v: -(500 + R() * 700), w: (R() - .5) * 5, d: R() * .12 }));
const CRACK = Array.from({ length: 11 }, (_, i) => [i / 10, (R() - .5) * .34]);
const WORDMARK = new Path2D(window.LOGO_WORD);
const MARK_L = new Path2D('M0 32H44V56H68V100H0Z');

// ---------- elements ----------
function note(n, x, y, s, rot, alpha = 1) {
  if (alpha <= 0 || s <= 1) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= alpha;
  shadow(true, 22, 10, .13); ctx.fillStyle = n.col; rr(-s / 2, -s / 2, s, s, 6 * u); ctx.fill(); shadow(false);
  ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 1.5 * u; ctx.stroke();
  const px = fitFont(700, n.txt, s * .16, s * .8, -.01);
  ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(n.txt, -s * .4, -s * .4 + px);
  ctx.fillStyle = 'rgba(0,0,0,.13)';
  rr(-s * .4, s * .02, s * .66, s * .055, s * .03); ctx.fill(); rr(-s * .4, s * .16, s * .44, s * .055, s * .03); ctx.fill();
  ctx.restore();
}

function bulbPath(r) {
  const p = new Path2D();
  p.arc(0, 0, r, Math.PI * .75, Math.PI * 2.25);
  p.lineTo(r * .4, r * 1.28); p.lineTo(-r * .4, r * 1.28); p.closePath();
  p.moveTo(-r * .4, r * 1.5); p.lineTo(r * .4, r * 1.5);
  p.moveTo(-r * .26, r * 1.72); p.lineTo(r * .26, r * 1.72);
  return p;
}
function bulb(t) {
  if (t < 1.55 || t > 4.45) return;
  const r = (LAND ? 90 : 110) * u, x = ST.cx, y = ST.cy - r * .4;
  const out = E.inExpo(seg(t, 3.95, 4.4));
  const on = t > 2.35 || (t > 2.05 && t < 2.11) || (t > 2.16 && t < 2.28) ? 1 : 0;
  const pop = spring(t - 2.05, 3, 8);
  ctx.save(); ctx.translate(x, y); const sc = (1 + .12 * wobble(t - 2.05, 4, 8)) * (1 - out); ctx.scale(sc, sc);
  const p = bulbPath(r);
  if (on) { ctx.fillStyle = C.mark; ctx.fill(p); }
  drawOn(p, r * 9, E.inOutCubic(seg(t, 1.6, 2.05)), C.ink, 9 * u);
  if (on) {
    // filament
    ctx.strokeStyle = C.ink; ctx.lineWidth = 6 * u; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(-r * .25, r * .55); ctx.lineTo(-r * .12, r * .1); ctx.lineTo(0, r * .4); ctx.lineTo(r * .12, r * .1); ctx.lineTo(r * .25, r * .55); ctx.stroke();
    // rays
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.0 + i / 8), pulse = .5 + .5 * Math.sin(t * 18 + i);
      const r0 = r * 1.28, r1 = r * (1.28 + .28 * pop + .08 * pulse);
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
    }
  }
  ctx.restore();
}

// note position/size/rot through scenes 2-3
function notePose(n, i, t) {
  const tb = 2.12 + i * .085, d = t - tb;
  const bx = ST.cx, by = ST.cy - (LAND ? 36 : 44) * u;
  const sp = spring(d, 2, 6);
  let x = lerp(bx, n.x, sp), y = lerp(by, n.y, sp), s = NS * clamp(spring(d, 2.6, 7), 0, 1.2), rot = n.rot * sp;
  x += noise(t * .6, n.ph) * 5 * u; y += noise(t * .5, n.ph + 2) * 5 * u;
  const tc = 4.5 + i * .045, pc = E.outExpo(seg(t, tc, tc + .6));
  if (pc > 0) { const [cx, cy] = cellXY(n.cell); x = lerp(x, cx, pc); y = lerp(y, cy, pc); s = lerp(s, CELL_NS, pc); rot = lerp(rot, n.crot, pc); }
  const j = E.inCubic(seg(t, 6.1, 7.35));
  if (j > 0) { x += noise(t * 3, n.ph) * 9 * u * j; y += noise(t * 3, n.ph + 5) * 9 * u * j; rot += noise(t * 2.5, n.ph + 9) * .12 * j; }
  return { x, y, s, rot, alpha: d > 0 ? 1 : 0 };
}

function calendar(t) {
  const p = seg(t, 4.35, 4.95); if (p <= 0) return;
  const x0 = ST.cx - ST.hw, y0 = ST.cy - ST.hh + GHEAD, gw = 2 * ST.hw, gh = 2 * ST.hh - GHEAD;
  ctx.save(); ctx.strokeStyle = C.line; ctx.lineWidth = 2 * u;
  for (let r = 0; r <= GROWS; r++) { const v = E.outExpo(clamp(p * 1.6 - r * .1)); ctx.beginPath(); ctx.moveTo(x0, y0 + r * CH); ctx.lineTo(x0 + gw * v, y0 + r * CH); ctx.stroke(); }
  for (let c = 0; c <= GCOLS; c++) { const v = E.outExpo(clamp(p * 1.6 - c * .07)); ctx.beginPath(); ctx.moveTo(x0 + c * CW, y0); ctx.lineTo(x0 + c * CW, y0 + gh * v); ctx.stroke(); }
  const hp = (LAND ? 26 : 30) * u; font(700, hp, .08);
  'MTWTFSS'.split('').forEach((d, c) => rise(d, x0 + (c + .5) * CW, y0 - 18 * u, hp, E.outExpo(seg(t, 4.4 + c * .04, 4.8 + c * .04)), 0, C.muted, 'center'));
  ctx.restore();
}

function strings(t) {
  const p = E.inOutCubic(seg(t, 5.55, 6.95)); if (p <= 0) return;
  const pts = STRING.pts, n = Math.floor(p * (pts.length - 1));
  ctx.save(); ctx.strokeStyle = C.bad; ctx.lineWidth = 5 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const j = E.inCubic(seg(t, 6.1, 7.35));
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const [x, y] = pts[i]; const jx = noise(t * 3, i * .07) * 6 * u * j; i ? ctx.lineTo(x + jx, y + jx) : ctx.moveTo(x, y); }
  ctx.stroke();
  // pins where the string passes each note
  ctx.fillStyle = C.bad;
  STRING.order.forEach((ni, k) => { if (k * 24 <= n) { const [x, y] = cellXY(NOTES[ni].cell); ctx.beginPath(); ctx.arc(x, y, Math.max(0, 9 * u * spring((n - k * 24) / 60, 3, 8)), 0, 7); ctx.fill(); } });
  ctx.restore();
}

// ---------- phone + notifications ----------
const PH = LAND ? { x: ST.cx - 380 * u, w: 330 * u, h: 640 * u } : { x: ST.cx, w: 420 * u, h: 820 * u };
function fallXf(i, t) {
  const d = t - 10.02 - FALL[i].d; if (d <= 0) return;
  ctx.translate(0, FALL[i].v * u * d + .5 * 9000 * u * d * d); ctx.rotate(FALL[i].w * d);
}
function phone(t) {
  if (t < 7.3 || t > 10.8) return;
  const tl = t - 7.45, { x, w, h } = PH, y = ST.cy;
  ctx.save(); ctx.translate(x, y); fallXf(0, t);
  ctx.rotate(noise(t * 1.5, 3) * .03 * seg(t, 8.4, 10));
  shadow(true, 40, 20, .18); ctx.fillStyle = C.ink; rr(-w / 2, -h / 2, w, h, w * .14); ctx.fill(); shadow(false);
  const sw = w * .92, sh = h - w * .08, sx = -sw / 2, sy = -sh / 2;
  ctx.fillStyle = C.surface; rr(sx, sy, sw, sh, w * .1); ctx.fill();
  ctx.save(); rr(sx, sy, sw, sh, w * .1); ctx.clip();
  ctx.fillStyle = C.ink; rr(-w * .14, sy + sh * .018, w * .28, sh * .032, sh * .016); ctx.fill();
  // REC pill
  const ry = sy + sh * .09, blink = Math.sin(t * 14) > -.2;
  ctx.fillStyle = C.badSoft; rr(sx + sw * .07, ry - sh * .025, sw * .42, sh * .05, sh * .025); ctx.fill();
  if (blink) { ctx.fillStyle = C.bad; ctx.beginPath(); ctx.arc(sx + sw * .13, ry, sh * .011, 0, 7); ctx.fill(); }
  const secs = Math.floor(Math.max(0, tl) * 9);
  font(700, sh * .026, .02); ctx.fillStyle = C.bad; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`REC 00:${String(secs % 60).padStart(2, '0')}`, sx + sw * .17, ry + 1);
  // viewfinder
  const vx = sx + sw * .07, vy = sy + sh * .15, vw = sw * .86, vh = sh * .47;
  ctx.fillStyle = C.tag; rr(vx, vy, vw, vh, sw * .04); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1.5 * u; ctx.beginPath();
  for (let k = 1; k < 3; k++) { ctx.moveTo(vx + vw * k / 3, vy); ctx.lineTo(vx + vw * k / 3, vy + vh); ctx.moveTo(vx, vy + vh * k / 3); ctx.lineTo(vx + vw, vy + vh * k / 3); }
  ctx.stroke();
  const fb = vw * (.22 + .03 * Math.sin(t * 9)), fx = vx + vw / 2 + noise(t, 1) * vw * .12, fy = vy + vh * .58 + noise(t, 4) * vh * .1, k = fb * .3;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 5 * u; ctx.beginPath();
  for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const cx = fx + ax * fb / 2, cy = fy + ay * fb / 2; ctx.moveTo(cx - ax * k, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - ay * k); }
  ctx.stroke();
  // on-screen hook text
  const hook = '3 sebab kenapa…';
  fitFont(900, hook, vh * .075, vw * .8, -.01); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const hw = ctx.measureText(hook).width + vw * .08;
  ctx.fillStyle = C.mark; rr(vx + vw / 2 - hw / 2, vy + vh * .1, hw, vh * .13, vh * .02); ctx.fill();
  ctx.fillStyle = C.ink; ctx.fillText(hook, vx + vw / 2, vy + vh * .167);
  // record button
  const by = sy + sh * .705, br = sw * .1 * (1 + .06 * Math.sin(t * 12));
  ctx.strokeStyle = C.ink; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.arc(0, by, br * 1.25, 0, 7); ctx.stroke();
  ctx.fillStyle = C.bad; ctx.beginPath(); ctx.arc(0, by, br, 0, 7); ctx.fill();
  // waveform
  const wy = sy + sh * .82, wh = sh * .05;
  ctx.fillStyle = C.carbon;
  for (let b = 0; b < 26; b++) { const bh = wh * (.2 + .8 * Math.abs(noise(t * 2 + b * .3, b))); ctx.fillRect(sx + sw * .07 + b * sw * .033, wy - bh / 2, sw * .018, bh); }
  // timeline with accelerating clips
  const ly = sy + sh * .88, lh = sh * .065, lx = sx + sw * .07, lw = sw * .86;
  ctx.save(); rr(lx, ly, lw, lh, lh * .2); ctx.clip(); ctx.fillStyle = C.bg; ctx.fillRect(lx, ly, lw, lh);
  const off = (220 * Math.max(0, tl) + 520 * Math.max(0, tl) ** 2) * u;
  let cx = lx - (off % (CLIP_LEN * u));
  for (let rep = 0; rep < 4; rep++) for (const c of CLIPS) { ctx.fillStyle = c.c; rr(cx, ly + lh * .15, c.w * u, lh * .7, 4 * u); ctx.fill(); cx += (c.w + 6) * u; }
  ctx.restore();
  ctx.fillStyle = C.ink; ctx.fillRect(-1.5 * u, ly - lh * .2, 3 * u, lh * 1.4);
  ctx.restore();
  ctx.restore();
}
function pings(t) {
  const pw = 600 * u, ph = (LAND ? 84 : 104) * u, px = (LAND ? 30 : 34) * u;
  PINGS.forEach(([t0, txt, col], i) => {
    const d = t - t0; if (d <= 0) return;
    const side = i % 2 ? 1 : -1;
    const cx = LAND ? ST.cx + 470 * u : ST.cx + side * 150 * u;
    const cy = LAND ? ST.cy - ST.hh + 50 * u + i * 92 * u : ST.cy - ST.hh + 70 * u + i * 142 * u;
    const sp = spring(d, 2.4, 7);
    ctx.save(); ctx.translate(cx + (1 - sp) * (LAND ? 1 : side) * 520 * u, cy); fallXf(i + 1, t);
    ctx.globalAlpha = seg(d, 0, .1); const sc = lerp(.85, 1, sp); ctx.scale(sc, sc);
    shadow(true, 26, 12, .14); ctx.fillStyle = C.surface; rr(-pw / 2, -ph / 2, pw, ph, ph / 2); ctx.fill(); shadow(false);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.5 * u; ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-pw / 2 + ph * .45, 0, ph * .11, 0, 7); ctx.fill();
    font(700, px, -.01); ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, -pw / 2 + ph * .8, 1);
    ctx.restore();
  });
}

// ---------- HUD ----------
const CHAP = [[1.55, 4.5, '01', 'Ideas', C.ink], [4.5, 7.45, '02', 'Strategy', C.ink], [7.45, 10.0, '03', 'Execution', C.ink],
  [10.0, 11.0, '!!', 'Burnout', C.bad], [11.0, 13.0, '04', 'Diagnosis', C.good]];
function hud(t) {
  const px = (LAND ? 32 : 36) * u;
  for (const [a, b, num, label, col] of CHAP) {
    const pin = E.outExpo(seg(t, a, a + .4)), pout = b >= 13 ? E.inExpo(seg(t, 12.95, 13.2)) : E.inExpo(seg(t, b - .12, b));
    font(700, px, .02); rise(num, M, HUDY, px, pin, pout, col === C.ink ? C.muted : col);
    font(700, px, -.01); rise(label, M + px * 1.6, HUDY, px, pin, pout, col);
  }
  // battery: drains across the three jobs, dies at burnout, recharges with diagnosis
  const vis = seg(t, 1.55, 1.9) * (1 - seg(t, 12.95, 13.2)); if (vis <= 0) return;
  const lvl = keys([[1.5, 1], [4.5, .64], [7.45, .31], [10, .03], [10.12, 0], [11.35, 0], [12.6, 1]], t);
  const bw = 84 * u, bh = 40 * u, bx = W - M - bw - 8 * u, by = HUDY - bh * .85;
  const dead = t > 10 && t < 11.35, col = t > 11.35 ? C.good : lvl < .25 ? C.bad : C.ink;
  ctx.save(); ctx.globalAlpha = vis * (dead ? (Math.sin(t * 22) > 0 ? 1 : .25) : 1);
  ctx.strokeStyle = dead ? C.bad : C.ink; ctx.lineWidth = 3.5 * u; rr(bx, by, bw, bh, 8 * u); ctx.stroke();
  ctx.fillStyle = dead ? C.bad : C.ink; rr(bx + bw + 3 * u, by + bh * .3, 6 * u, bh * .4, 2 * u); ctx.fill();
  if (lvl > 0) { ctx.fillStyle = col; rr(bx + 6 * u, by + 6 * u, (bw - 12 * u) * lvl, bh - 12 * u, 4 * u); ctx.fill(); }
  font(700, px * .9, 0); ctx.fillStyle = dead ? C.bad : col; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${Math.round(lvl * 100)}%`, bx - 14 * u, HUDY);
  ctx.restore();
}

// ---------- captions (the narrator) ----------
const CAPS = [[.5, 1.4, 'One creator. Three jobs.', 'Three jobs.'], [1.75, 4.4, 'Ideas pile up.', 'pile up.'], [4.75, 7.3, 'Strategy gets tangled.', 'tangled.'],
  [7.75, 9.95, 'Execution never stops.', 'never stops.'], [11.45, 12.95, 'We find what’s working.', 'what’s working.']];
function captions(t) {
  for (const [a, b, txt, hi] of CAPS) {
    if (t < a || t > b + .3) continue;
    const pout = E.inCubic(seg(t, b, b + .2)); if (pout >= 1) continue;
    const px = fitFont(700, txt, CAPPX, W - 2 * M, -.025);
    const full = ctx.measureText(txt).width, x0 = CX - full / 2, hiAt = txt.indexOf(hi);
    const hx = x0 + ctx.measureText(txt.slice(0, hiAt)).width, hw = ctx.measureText(hi).width;
    const hp = E.outExpo(seg(t, a + .22, a + .6));
    ctx.fillStyle = C.mark; ctx.fillRect(hx - 10 * u + (hw + 20 * u) * pout, CAPY - px * .8, (hw + 20 * u) * Math.max(0, hp - pout), px * 1.02);
    let x = x0;
    txt.split(' ').forEach((wd, k) => {
      rise(wd, x, CAPY, px, E.outExpo(seg(t, a + k * .055, a + k * .055 + .45)), pout, C.ink);
      x += ctx.measureText(wd + ' ').width;
    });
  }
}

// ---------- scenes ----------
const TILE = LAND ? { w: 460 * u, h: 300 * u, gap: 40 * u } : { w: 300 * u, h: 420 * u, gap: 28 * u };
const TILES = ['Ideas', 'Strategy', 'Execution'];
function tileIcon(i, cx, cy, s, p) {
  ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = C.ink; ctx.lineWidth = 6 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha *= p; const sc = lerp(.6, 1, E.outBack(p)); ctx.scale(sc, sc);
  if (i === 0) { ctx.save(); ctx.translate(0, -s * .12); ctx.stroke(bulbPath(s * .28)); ctx.restore(); }
  if (i === 1) { for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { rr(-s * .4 + c * s * .28, -s * .4 + r * s * .28, s * .22, s * .22, 4 * u); ctx.stroke(); } }
  if (i === 2) { rr(-s * .26, -s * .42, s * .52, s * .84, s * .08); ctx.stroke(); ctx.fillStyle = C.bad; ctx.beginPath(); ctx.arc(0, s * .14, s * .1, 0, 7); ctx.fill(); }
  ctx.restore();
}
function scene1(t) {
  if (t > 1.75) return;
  const sq = 120 * u, cy = ST.cy;
  const drop = E.inCubic(seg(t, 0, .32));
  const split = E.outExpo(seg(t, .62, 1.0));
  const zoom = E.inOutExpo(seg(t, 1.28, 1.72));
  const total = 3 * TILE.w + 2 * TILE.gap;
  for (let i = 2; i >= 0; i--) {
    if (i > 0 && split <= 0) continue;
    const tx = CX - total / 2 + i * (TILE.w + TILE.gap), ty = cy - TILE.h / 2;
    const sy = lerp(-sq * 1.5, cy - sq / 2, drop);
    const squash = t < .9 ? wobble(t - .32, 3.2, 9) : 0;
    const sqRect = [CX - sq / 2 * (1 + squash * .5), sy + sq * squash * .5, sq * (1 + squash * .5), sq * (1 - squash * .5)];
    let rect = lerpRect(sqRect, [tx, ty, TILE.w, TILE.h], split);
    let col = mix(C.ink, C.tag, split), rad = lerp(0, 10 * u, split);
    ctx.save();
    if (i === 0 && zoom > 0) { rect = lerpRect(rect, [0, 0, W, H], zoom); col = mix(C.tag, C.bg, zoom); rad = lerp(rad, 0, zoom); }
    if (i > 0 && zoom > 0) { rect[0] += zoom * W; ctx.globalAlpha = 1 - zoom; }
    ctx.fillStyle = col; rr(...rect, rad); ctx.fill();
    const lp = seg(t, .85 + i * .06, 1.15 + i * .06) * (1 - seg(t, 1.2, 1.32));
    if (lp > 0) {
      tileIcon(i, rect[0] + rect[2] / 2, rect[1] + rect[3] * .42, Math.min(rect[2], rect[3]) * .5, lp);
      font(700, 26 * u, .04); rise(`0${i + 1}`, rect[0] + 28 * u, rect[1] + 54 * u, 26 * u, E.outExpo(lp), 0, C.muted);
      const lpx = fitFont(700, TILES[i], 44 * u, rect[2] - 56 * u, -.02);
      rise(TILES[i], rect[0] + 28 * u, rect[1] + rect[3] - 30 * u, lpx, E.outExpo(lp), 0, C.ink);
    }
    ctx.restore();
  }
}
function scene23(t) {
  if (t < 1.6 || t > 7.7) return;
  calendar(t);
  bulb(t);
  NOTES.forEach((n, i) => { const p = notePose(n, i, t); note(n, p.x, p.y, p.s, p.rot, p.alpha); });
  strings(t);
}
function burnout(t) {
  if (t < 10.08 || t > 11.5) return;
  const txt = 'Burnout.';
  const px = fitFont(900, txt, (LAND ? 300 : 260) * u, W * .84, -.04);
  const tw = ctx.measureText(txt).width, x0 = CX - tw / 2, base = ST.cy + px * .35;
  const s = lerp(1.35, 1, E.outExpo(seg(t, 10.1, 10.4)));
  const crack = E.outExpo(seg(t, 10.42, 10.62));
  const yc = base - px * .36;
  const pts = CRACK.map(([fx, fy]) => [x0 - 30 * u + fx * (tw + 60 * u), yc + fy * px]);
  ctx.save(); ctx.translate(CX, ST.cy); ctx.scale(s, s); ctx.translate(-CX, -ST.cy);
  ctx.globalAlpha = seg(t, 10.08, 10.14);
  ctx.fillStyle = C.bad; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const half of [0, 1]) {
    ctx.save(); ctx.beginPath();
    ctx.moveTo(-10, half ? H + 10 : -10); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(W + 10, half ? H + 10 : -10); ctx.closePath(); ctx.clip();
    if (half) { ctx.translate(10 * u * crack, 16 * u * crack); ctx.rotate(.018 * crack); }
    ctx.fillText(txt, x0, base); ctx.restore();
  }
  ctx.restore();
}
// green growth line behind the fixed cards
function chart(t) {
  const p = E.inOutCubic(seg(t, 11.35, 12.55)), out = seg(t, 13.0, 13.3); if (p <= 0 || out >= 1) return;
  const N = 60, pts = [];
  for (let i = 0; i <= N; i++) { const v = i / N; pts.push([ST.cx - ST.hw + v * 2 * ST.hw, ST.cy + ST.hh * .85 - E.inCubic(v) * ST.hh * 1.6 - Math.sin(v * 17) * 16 * u * (1 - v)]); }
  const n = Math.floor(p * N);
  ctx.save(); ctx.globalAlpha = 1 - out;
  ctx.fillStyle = C.goodSoft; ctx.beginPath(); ctx.moveTo(pts[0][0], ST.cy + ST.hh);
  for (let i = 0; i <= n; i++) ctx.lineTo(...pts[i]); ctx.lineTo(pts[n][0], ST.cy + ST.hh); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.good; ctx.lineWidth = 6 * u; ctx.lineJoin = 'round'; ctx.beginPath();
  for (let i = 0; i <= n; i++) i ? ctx.lineTo(...pts[i]) : ctx.moveTo(...pts[i]); ctx.stroke();
  ctx.fillStyle = C.good; ctx.beginPath(); ctx.arc(...pts[n], 11 * u, 0, 7); ctx.fill();
  ctx.restore();
}
const CARDS = [['01', 'Ideas', 'Sorted into 3 series'], ['02', 'Strategy', '4 pillars, 1 plan'], ['03', 'Execution', '3 posts a week, mapped']];
function cards(t) {
  if (t < 11.25 || t > 13.4) return;
  const cw = LAND ? 520 * u : 900 * u, ch = LAND ? 260 * u : 196 * u, gap = LAND ? 40 * u : 36 * u;
  CARDS.forEach(([num, title, sub], i) => {
    const d = t - (11.3 + i * .12), sp = spring(d, 2, 7); if (d <= 0) return;
    const out = E.inExpo(seg(t, 13.0 + (2 - i) * .05, 13.3 + (2 - i) * .05)); if (out >= 1) return;
    let x, y;
    if (LAND) { x = CX - (3 * cw + 2 * gap) / 2 + i * (cw + gap); y = ST.cy - ch / 2; }
    else { x = CX - cw / 2; y = ST.cy - (3 * ch + 2 * gap) / 2 + i * (ch + gap); }
    ctx.save(); ctx.translate(x + cw / 2, y + ch / 2 + (1 - sp) * 180 * u);
    const sc = 1 - out; ctx.scale(sc, sc); ctx.globalAlpha = seg(d, 0, .12);
    ctx.translate(-cw / 2, -ch / 2);
    shadow(true, 30, 14, .12); ctx.fillStyle = C.surface; rr(0, 0, cw, ch, 8 * u); ctx.fill(); shadow(false);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.5 * u; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const P = LAND ? 36 * u : 40 * u;
    font(700, 26 * u, .04); ctx.fillStyle = C.muted; ctx.fillText(num, P, LAND ? 60 * u : 58 * u);
    font(700, 54 * u, -.025); ctx.fillStyle = C.ink; ctx.fillText(title, P, LAND ? 160 * u : 124 * u);
    font(500, 30 * u, -.01); ctx.fillStyle = C.muted; ctx.fillText(sub, P, LAND ? 210 * u : 168 * u);
    // check
    const cp = seg(t, 11.85 + i * .18, 12.15 + i * .18), cr = 32 * u;
    const kx = LAND ? cw - 66 * u : cw - 84 * u, ky = LAND ? 66 * u : ch / 2;
    if (cp > 0) {
      ctx.fillStyle = C.good; ctx.beginPath(); ctx.arc(kx, ky, Math.max(0, cr * E.outBack(clamp(cp * 2), 3)), 0, 7); ctx.fill();
      const ck = new Path2D(); ck.moveTo(kx - cr * .42, ky + cr * .02); ck.lineTo(kx - cr * .1, ky + cr * .34); ck.lineTo(kx + cr * .46, ky - cr * .3);
      drawOn(ck, cr * 2, E.outCubic(seg(cp, .35, 1)), C.surface, 6 * u);
    }
    ctx.restore();
  });
}
function lockup(t) {
  if (t < 13.05) return;
  const tw = (LAND ? 1050 : 900) * u, k = tw / 8378.41, lh = 1029.41 * k;
  const ox = CX - tw / 2, oy = ST.cy - lh / 2 - (LAND ? 40 : 60) * u;
  const s10 = 10.29 * k;
  // the opening square returns and lands in its notch
  const land = 13.36, drop = E.inCubic(seg(t, 13.08, land));
  const sqS = 24 * s10, sqX = ox + 76 * s10, sqY = lerp(-sqS * 2, oy, drop);
  const sw = wobble(t - land, 3.2, 9);
  ctx.fillStyle = C.ink;
  ctx.fillRect(sqX - sqS * sw * .25, sqY + sqS * sw * .5, sqS * (1 + sw * .5), sqS * (1 - sw * .5));
  // L grows from the floor
  const lp = E.outExpo(seg(t, 13.34, 13.7));
  if (lp > 0) { ctx.save(); ctx.beginPath(); ctx.rect(ox - 10, oy + lh * (1 - lp), 100 * s10 + 20, lh * lp + 10); ctx.clip(); ctx.translate(ox, oy); ctx.scale(s10, s10); ctx.fill(MARK_L); ctx.restore(); }
  // wordmark wipes in
  const wp = E.inOutExpo(seg(t, 13.48, 14.0));
  if (wp > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(ox + 1200 * k, oy - 20 * u, (8378.41 - 1200) * k * wp, lh + 40 * u); ctx.clip();
    ctx.translate(ox + 1276.41 * k + (1 - wp) * -60 * u, oy + 1029.41 * k); ctx.scale(k, k); ctx.fill(WORDMARK); ctx.restore();
  }
  // sub line + url
  const spx = (LAND ? 36 : 38) * u, sy = oy + lh + (LAND ? 90 : 110) * u;
  const sub = 'Instagram & TikTok account diagnosis';
  font(500, spx, -.01);
  const subW = ctx.measureText(sub).width, hiW = ctx.measureText('diagnosis').width;
  const hp = E.outExpo(seg(t, 14.15, 14.5));
  ctx.fillStyle = C.mark; ctx.fillRect(CX + subW / 2 - hiW - 8 * u, sy - spx * .78, (hiW + 16 * u) * hp, spx * 1.02);
  font(500, spx, -.01); rise(sub, CX, sy, spx, E.outExpo(seg(t, 13.95, 14.35)), 0, C.carbon, 'center');
  const up = spring(t - 14.2, 2.2, 7); if (up <= 0) return;
  const url = 'ruangkotak.com', upx = (LAND ? 34 : 38) * u;
  font(700, upx, 0); const uw = ctx.measureText(url).width + upx * 1.6, uh = upx * 2, uy = sy + (LAND ? 60 : 80) * u;
  ctx.save(); ctx.translate(CX, uy + uh / 2); ctx.scale(up, up);
  ctx.fillStyle = C.ink; rr(-uw / 2, -uh / 2, uw, uh, uh / 2); ctx.fill();
  ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(url, 0, 2 * u);
  ctx.restore();
}

// ---------- camera ----------
function camera(t) {
  let s = 1, x = 0, y = 0, r = 0;
  if (t > .32 && t < .8) y += wobble(t - .32, 4, 10) * 18 * u;
  s *= 1 + .035 * seg(t, 1.7, 4.5) + .03 * seg(t, 4.5, 7.3);
  const sh = E.inCubic(seg(t, 8.4, 10.0)) * (t < 10.02 ? 1 : 0);
  x += noise(t * 2.2, 1) * 16 * u * sh; y += noise(t * 2.2, 7) * 16 * u * sh; r += noise(t * 1.4, 3) * .012 * sh;
  s *= 1 + .05 * wobble(t - 10.12, 3, 7);
  s *= 1 + .03 * seg(t, 13.4, 15);
  return { s, x, y, r };
}
function withCam(cam, fn) {
  ctx.save(); ctx.translate(CX + cam.x, H / 2 + cam.y); ctx.rotate(cam.r); ctx.scale(cam.s, cam.s); ctx.translate(-CX, -H / 2); fn(); ctx.restore();
}

window.draw = t => {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.fillStyle = mix(C.bg, C.badSoft, seg(t, 10.0, 10.06)); ctx.fillRect(0, 0, W, H);
  const cam = camera(t);
  // whip pan strategy -> execution
  const wp = E.inOutCubic(seg(t, 7.28, 7.62)), WX = W * 1.15;
  withCam(cam, () => {
    scene1(t);
    ctx.save(); ctx.translate(-wp * WX, 0); scene23(t); ctx.restore();
    ctx.save(); ctx.translate((1 - wp) * WX, 0); phone(t); pings(t); ctx.restore();
    burnout(t);
  });
  // diagnosis: a clean circle opens out of the burnout
  const rv = E.inOutExpo(seg(t, 11.0, 11.45));
  if (rv > 0) {
    ctx.save(); ctx.beginPath(); ctx.arc(CX, ST.cy, DIAG * rv, 0, 7); ctx.clip();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    withCam(cam, () => { chart(t); cards(t); lockup(t); });
    ctx.restore();
    if (rv < 1) { ctx.strokeStyle = C.ink; ctx.lineWidth = 8 * u; ctx.beginPath(); ctx.arc(CX, ST.cy, DIAG * rv, 0, 7); ctx.stroke(); }
  }
  hud(t);
  captions(t);
};
window.ready = Promise.all(['500', '700', '900'].map(w => document.fonts.load(`${w} 10px I`))).then(() => { window.draw(0); return true; });
})();
