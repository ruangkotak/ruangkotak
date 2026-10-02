// RUANGKOTAK 15s reel. Everything is a pure function of time: window.draw(t) paints frame t (seconds).
(() => {
const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1920), H = +(q.get('h') || 1080);
const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');
const S = Math.min(W, H) / 1080, LAND = W > H, CX = W / 2, CY = H / 2, DIAG = Math.hypot(W, H);
const M = (LAND ? 110 : 70) * S;

// Site palette (app/globals.css). Green is the only accent; red only means "below your usual".
const C = {
  ink: '#0f1317', bg: '#f3f4f5', muted: '#525c66', line: '#d3d8dd',
  good: '#0b7a64', goodSoft: '#d2e8e1', bad: '#be2f4a', badSoft: '#f5d8de',
  dLine: '#39424a', dFlat: '#1d2328', dGood: '#34b597', dGoodSoft: '#143a31',
  dBad: '#e3657d', dBadSoft: '#401c25', dMuted: '#9aa3ad', white: '#e9ecef',
};
const LIGHT = { flat: C.line, up: C.goodSoft, down: C.badSoft, top: C.good, bot: C.bad };
const DARK = { flat: C.dFlat, up: C.dGoodSoft, down: C.dBadSoft, top: C.dGood, bot: C.dBad };

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
// damped spring from 0 to 1, d = seconds since release
const spring = (d, freq = 2.4, damp = 7) => d <= 0 ? 0 : 1 - Math.exp(-damp * d) * Math.cos(2 * Math.PI * freq * d);
// decaying wobble around 0 (for squash)
const wobble = (d, freq = 2.8, damp = 8) => d <= 0 ? 0 : Math.exp(-damp * d) * Math.cos(2 * Math.PI * freq * d);
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = (i, j) => rng(i * 7919 + j * 104729 + 1013)();
const mix = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = s => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, clamp(t)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};
const fmt = n => Math.round(n).toLocaleString('en-US');

// ---------- drawing helpers ----------
function font(weight, px, mono = false, trackEm = 0) {
  ctx.font = `${weight} ${px}px ${mono ? 'GM' : 'G'}`;
  ctx.letterSpacing = `${trackEm * px}px`;
}
function fitPx(text, weight, maxW, maxPx, trackEm) { font(weight, 100, false, trackEm); return Math.min(maxPx, 100 * maxW / ctx.measureText(text).width); }
// Line that rises out of a mask. y is the baseline.
function rise(txt, x, y, px, p, color, align = 'left') {
  if (p <= 0) return;
  ctx.save(); ctx.beginPath(); ctx.rect(-1e5, y - px * 1.02, 2e5, px * 1.32); ctx.clip();
  ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(txt, x, y + (1 - p) * px * 1.2);
  ctx.restore();
}
function cover(img, x, y, w, h) {
  if (w < 1 || h < 1) return;
  const ir = img.naturalWidth / img.naturalHeight, r = w / h;
  let sw, sh, sx, sy;
  if (ir > r) { sh = img.naturalHeight; sw = sh * r; sx = (img.naturalWidth - sw) / 2; sy = 0; }
  else { sw = img.naturalWidth; sh = sw / r; sx = 0; sy = (img.naturalHeight - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
// Stroke a rect progressively (p = 0..1 of its perimeter).
function drawRect(x, y, w, h, p, color, lw) {
  if (p <= 0) return;
  const per = 2 * (w + h);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'square';
  ctx.setLineDash([per * p, per]); ctx.strokeRect(x, y, w, h); ctx.restore();
}
const lerpRect = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
function fullSquare(color, p, turn = Math.PI / 2) {
  if (p <= 0) return;
  const s = DIAG * 1.05 * p;
  ctx.save(); ctx.translate(CX, CY); ctx.rotate((1 - p) * turn); ctx.fillStyle = color; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore();
}

// ---------- data (sample report: views of the 9 latest reels, oldest first) ----------
const REELS = [[356, 9], [327, 8], [340, 7], [222, 6], [213, 5], [131, 4], [1203, 3], [208, 2], [380, 1]].map(([v, n]) => {
  const img = new Image(); img.src = `sample/${n}.jpg`;
  const st = v === 1203 ? 'top' : v === 131 ? 'bot' : v < 327 ? 'down' : v > 327 ? 'up' : 'flat';
  return { v, img, st };
});
const TOP = 6, USUAL = 327, MAXV = 1203;
const STORY = REELS[TOP].img;
const WORDMARK = new Path2D(window.LOGO_WORD);
const MARK_L = new Path2D('M0 32H44V56H68V100H0Z');

// camera shake impulses [time, amplitude px@1080]
const SHAKES = [[0.5, 18], [9.0, 8], [9.66, 5], [9.76, 5], [9.86, 5], [9.96, 6], [10.605, 5], [10.921, 4], [11.237, 4], [11.553, 4], [11.868, 5], [12.95, 9]];
function shake(t) {
  let x = 0, y = 0;
  for (const [t0, a] of SHAKES) {
    const d = t - t0; if (d < 0 || d > 0.7) continue;
    const k = a * S * Math.exp(-d * 9);
    x += k * Math.sin(d * 83 + t0 * 7); y += k * Math.cos(d * 71 + t0 * 3);
  }
  return [x, y];
}

// =====================================================================
// 1+2. DROP -> GRID -> SCAN  (0 – 3.45)
// =====================================================================
const CELL = 120 * S, GAP = 12 * S, CS = CELL - GAP;
const NX = Math.ceil(W / 2 / CELL) + 1, NY = Math.ceil(H / 2 / CELL) + 1;
const CELLS = [];
for (let i = -NX; i <= NX; i++) for (let j = -NY; j <= NY; j++) {
  if (!i && !j) continue;
  const r = hash(i, j);
  const st = r < .5 ? 'flat' : r < .7 ? 'up' : r < .87 ? 'down' : r < .93 ? 'top' : 'bot';
  CELLS.push({ x: CX + i * CELL, y: CY + j * CELL, d: Math.hypot(i, j), st });
}
const MAXD = Math.max(...CELLS.map(c => c.d));
const DEBRIS = Array.from({ length: 14 }, (_, k) => {
  const r = rng(500 + k);
  const a = -Math.PI * (0.08 + 0.84 * r());
  const sp = (500 + 900 * r()) * S;
  return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: (8 + 14 * r()) * S, spin: (r() - .5) * 18 };
});

function sceneGrid(t) {
  const zp = E.inExpo(seg(t, 2.95, 3.45));
  const z = 1 + zp * (DIAG / CS * 1.25 - 1);
  const scanX = lerp(-0.1 * W, 1.1 * W, E.inOutCubic(seg(t, 1.4, 2.55)));
  const scanOf = x => clamp((scanX - x) / (0.2 * W));

  ctx.save();
  ctx.translate(CX, CY); ctx.rotate(zp * 0.4); ctx.scale(z, z); ctx.translate(-CX, -CY);

  for (const c of CELLS) {
    const ta = 0.7 + c.d / MAXD * 0.55;
    const p = seg(t, ta, ta + 0.5); if (p <= 0) continue;
    const cp = scanOf(c.x);
    const s = CS * E.outBack(p, 2.4) * (1 + Math.sin(Math.PI * cp) * 0.2);
    if (cp < 1) {
      ctx.globalAlpha = 1 - cp; ctx.strokeStyle = C.dLine; ctx.lineWidth = 1.6 * S;
      ctx.strokeRect(c.x - s / 2, c.y - s / 2, s, s);
    }
    if (cp > 0) { ctx.globalAlpha = cp; ctx.fillStyle = DARK[c.st]; ctx.fillRect(c.x - s / 2, c.y - s / 2, s, s); }
    if (p < .5) { ctx.globalAlpha = .35 * (1 - p * 2); ctx.fillStyle = C.white; ctx.fillRect(c.x - s / 2, c.y - s / 2, s, s); }
  }
  ctx.globalAlpha = 1;

  // the hero square: falls, lands, shrinks into the centre cell, turns green when scanned
  const land = 0.5, q0 = 180 * S;
  const size = lerp(q0, CS, E.inOutExpo(seg(t, 0.8, 1.15)));
  let yc, sx, sy, rot = 0;
  if (t < land) {
    const e = E.inCubic(seg(t, 0, land));
    yc = lerp(-q0, CY, e); sx = 1 - .2 * e * e; sy = 1 + .45 * e * e; rot = (1 - e) * .6;
  } else {
    const k = wobble(t - land, 2.6, 7);
    yc = CY; sx = 1 + .45 * k; sy = 1 - .45 * k;
  }
  const w = size * sx, h = size * sy;
  ctx.save(); ctx.translate(CX, yc + size / 2); ctx.rotate(rot);
  ctx.fillStyle = mix(C.white, C.dGood, scanOf(CX));
  ctx.fillRect(-w / 2, -h, w, h); ctx.restore();

  // impact rings + debris
  for (let r = 0; r < 3; r++) {
    const pr = seg(t, land + r * .07, land + r * .07 + .65); if (pr <= 0 || pr >= 1) continue;
    const s = q0 * (1 + 5.5 * E.outExpo(pr));
    ctx.globalAlpha = 1 - pr; ctx.strokeStyle = r === 1 ? C.dGood : C.white; ctx.lineWidth = (5 * (1 - pr) + 1) * S;
    ctx.strokeRect(CX - s / 2, CY - s / 2, s, s);
  }
  const dd = t - land;
  if (dd > 0 && dd < .9) {
    for (const b of DEBRIS) {
      const x = CX + b.vx * dd, y = CY + q0 / 2 + b.vy * dd + .5 * 2600 * S * dd * dd;
      ctx.save(); ctx.globalAlpha = 1 - dd / .9; ctx.translate(x, y); ctx.rotate(b.spin * dd);
      ctx.fillStyle = C.white; ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore(); // camera

  // scan line + readout
  if (t > 1.4 && t < 2.6) {
    ctx.fillStyle = C.dGood; ctx.fillRect(scanX - 1.5 * S, 0, 3 * S, H);
    ctx.globalAlpha = .08; ctx.fillRect(scanX - 220 * S, 0, 220 * S, H); ctx.globalAlpha = 1;
    font(500, 18 * S, true, .14); ctx.textAlign = 'left';
    const pct = Math.round(clamp(scanX / W) * 100);
    ctx.fillStyle = C.dGood; ctx.fillRect(scanX + 10 * S, H - 132 * S, 190 * S, 36 * S);
    ctx.fillStyle = C.ink; ctx.fillText(`DIAGNOSING ${String(pct).padStart(3, '0')}%`, scanX + 22 * S, H - 108 * S);
  }

  // headline card
  const ex = E.inExpo(seg(t, 2.9, 3.2));
  if (t > 1.6 && ex < 1) {
    const fs = (LAND ? 156 : 132) * S, pad = 56 * S;
    font(700, fs, false, -.045);
    const l1 = 'Every post', l2 = 'is a box.';
    const w1 = ctx.measureText(l1).width, w2 = ctx.measureText(l2).width;
    const bw = Math.max(w1, w2) + pad * 2, bh = pad * 2 + fs * 2.05;
    const top = CY - bh / 2;
    ctx.save(); ctx.globalAlpha = 1 - ex; ctx.translate(0, -ex * 140 * S);
    const bp = E.outExpo(seg(t, 1.6, 2.05));
    ctx.fillStyle = C.ink; ctx.fillRect(CX - bw / 2 * bp, top, bw * bp, bh);
    ctx.fillStyle = C.dGood; ctx.fillRect(CX - bw / 2 * bp, top, 8 * S, bh * E.outExpo(seg(t, 1.8, 2.2)));
    const y1 = top + pad + fs * .8, y2 = y1 + fs * 1.02;
    const x0 = CX - bw / 2 + pad;
    rise(l1, x0, y1, fs, E.outExpo(seg(t, 1.8, 2.4)), C.white);
    rise(l2, x0, y2, fs, E.outExpo(seg(t, 1.92, 2.52)), C.white);
    const pre = ctx.measureText('is a ').width, bx = ctx.measureText('box.').width - fs * .045;
    const rx = x0 + pre - 16 * S, ry = y2 - fs * .8, rw = bx + 32 * S, rh = fs * .98;
    drawRect(rx, ry, rw, rh, E.inOutCubic(seg(t, 2.35, 2.75)), C.dGood, 6 * S);
    // the logo's popped-out square, echoed on the word
    const sp = E.outBack(seg(t, 2.7, 2.95), 3);
    if (sp > 0) { const s = 30 * S * sp; ctx.fillStyle = C.dGood; ctx.fillRect(rx + rw + 10 * S, ry - 10 * S - s, s, s); }
    ctx.restore();
  }
}

// =====================================================================
// 3. READ EVERY REEL -> BARS -> 3.7x  (3.45 – 7.9)
// =====================================================================
function cardRect(i) {
  if (LAND) { const w = 168 * S, h = w * 16 / 9, g = 20 * S; return { x: CX + (i - 4) * (w + g), y: CY + 40 * S, w, h }; }
  const w = 250 * S, h = w * 16 / 9, g = 22 * S, c = i % 3, r = Math.floor(i / 3);
  return { x: CX + (c - 1) * (w + g), y: CY + 60 * S + (r - 1) * (h + g), w, h };
}
const BW = (LAND ? 148 : 98) * S, BGAP = (LAND ? 34 : 15) * S;
const BASE = LAND ? H - 175 * S : H - 360 * S, MAXH = LAND ? H * .55 : H * .47;
function barRect(i) { const h = REELS[i].v / MAXV * MAXH; return { x: CX + (i - 4) * (BW + BGAP), y: BASE - h / 2, w: BW, h }; }
const BAR_L = CX - 4 * (BW + BGAP) - BW / 2, BAR_R = CX + 4 * (BW + BGAP) + BW / 2;

function sceneBars(t) {
  if (t < 3.95) {
    ctx.fillStyle = C.dGood; ctx.fillRect(-60, -60, W + 120, H + 120);
    fullSquare(C.ink, E.outExpo(seg(t, 3.45, 3.8)));
    fullSquare(C.bg, E.outExpo(seg(t, 3.55, 3.93)), -Math.PI / 2);
  } else { ctx.fillStyle = C.bg; ctx.fillRect(-60, -60, W + 120, H + 120); }

  // kickers
  font(500, 20 * S, true, .14);
  const ky = LAND ? 175 * S : 235 * S;
  const k1 = E.outExpo(seg(t, 3.95, 4.4)) * (1 - seg(t, 4.75, 4.9));
  if (k1 > 0) rise('01 — READ EVERY REEL · 18 NOV – 17 FEB', M, ky, 20 * S, k1, C.muted);
  const k2 = E.outExpo(seg(t, 4.95, 5.4)) * (1 - E.inExpo(seg(t, 7.35, 7.55)));
  if (k2 > 0) rise('02 — VIEWS AGAINST YOUR USUAL', M, ky, 20 * S, k2, C.muted);

  // baseline
  const blp = E.outExpo(seg(t, 5.1, 5.6));
  if (blp > 0) { ctx.fillStyle = C.ink; ctx.fillRect(BAR_L - 20 * S, BASE, (BAR_R - BAR_L + 40 * S) * blp, 2 * S); }

  const dim = E.outCubic(seg(t, 6.45, 6.85));
  REELS.forEach((r, i) => {
    const t0 = 3.8 + i * .05, fp = seg(t, t0, t0 + .8);
    if (fp <= 0) return;
    const e = E.outExpo(fp);
    const cr = cardRect(i);
    const rot0 = (hash(i, 99) - .5) * 1.3;
    const fx = lerp(cr.x + (i - 4) * 70 * S, cr.x, e), fy = lerp(cr.y + H * .75, cr.y, e);
    const rot = rot0 * (1 - E.outBack(fp, 1.6)), sc = lerp(.6, 1, e);
    const mt = 4.85 + i * .035, mp = E.inOutExpo(seg(t, mt, mt + .7));
    const rect = lerpRect({ x: fx, y: fy, w: cr.w, h: cr.h }, barRect(i), mp);
    const alpha = i === TOP ? 1 : lerp(1, .22, dim);

    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(rect.x, rect.y); ctx.rotate(rot); ctx.scale(sc, sc);
    const sh = (1 - mp) * (1 - seg(t, 4.3, 4.8));
    if (sh > 0) { ctx.shadowColor = `rgba(15,19,23,${.28 * sh})`; ctx.shadowBlur = 40 * S; ctx.shadowOffsetY = 18 * S; }
    cover(r.img, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
    ctx.shadowColor = 'transparent';
    const tp = E.outCubic(seg(t, 5.45 + i * .03, 5.85 + i * .03));
    if (tp > 0) { ctx.globalAlpha = alpha * .92 * tp; ctx.fillStyle = LIGHT[r.st]; ctx.fillRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h); }
    ctx.restore();

    // card labels, then bar values
    const la = seg(t, 4.35, 4.6) * (1 - seg(t, 4.8, 4.92));
    if (la > 0) {
      ctx.globalAlpha = la; font(500, 20 * S, true, .02); ctx.fillStyle = C.ink; ctx.textAlign = 'left';
      ctx.fillText(`${fmt(r.v)} views`, cr.x - cr.w / 2, cr.y + cr.h / 2 + 32 * S); ctx.globalAlpha = 1;
    }
    const va = seg(t, 5.35, 5.5);
    if (va > 0) {
      const br = barRect(i);
      ctx.globalAlpha = va * alpha; font(500, (LAND ? 24 : 20) * S, true); ctx.textAlign = 'center';
      ctx.fillStyle = r.st === 'top' ? C.good : r.st === 'bot' ? C.bad : C.ink;
      ctx.fillText(fmt(r.v * E.outExpo(seg(t, 5.35, 6.1))), br.x, br.y - br.h / 2 - 14 * S);
      ctx.globalAlpha = 1;
    }
  });

  // "your usual" line
  const my = BASE - USUAL / MAXV * MAXH;
  const mlp = E.inOutCubic(seg(t, 5.9, 6.35));
  if (mlp > 0) {
    ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5 * S; ctx.setLineDash([12 * S, 9 * S]);
    ctx.beginPath(); ctx.moveTo(BAR_L - 20 * S, my); ctx.lineTo(lerp(BAR_L - 20 * S, BAR_R + 20 * S, mlp), my); ctx.stroke(); ctx.restore();
    const tg = E.outBack(seg(t, 6.15, 6.45), 2.2);
    if (tg > 0) {
      font(500, (LAND ? 17 : 15) * S, true, .1);
      const label = 'YOUR USUAL · 327', lw = ctx.measureText(label).width + 22 * S, lh = 32 * S;
      const lx = CX + .5 * (BW + BGAP) - lw / 2, ly2 = my - lh - 10 * S;
      ctx.save(); ctx.translate(lx + lw / 2, ly2 + lh); ctx.scale(tg, tg);
      ctx.fillStyle = C.ink; ctx.fillRect(-lw / 2, -lh, lw, lh);
      ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.fillText(label, 0, -lh / 2 + 6 * S); ctx.restore();
    }
  }

  // the story reel
  if (t > 6.4) {
    const out = E.inExpo(seg(t, 7.3, 7.55));
    ctx.save(); ctx.globalAlpha = 1 - out;
    const br = barRect(TOP), btop = br.y - br.h / 2;
    const pr = seg(t, 6.45, 6.95);
    if (pr > 0 && pr < 1) { const g = 1 + .25 * E.outExpo(pr); ctx.globalAlpha = (1 - pr) * (1 - out); drawRect(br.x - br.w * g / 2, BASE - br.h - (g - 1) * br.w / 2, br.w * g, br.h + (g - 1) * br.w / 2, 1, C.good, 4 * S); ctx.globalAlpha = 1 - out; }
    const fs = (LAND ? 240 : 220) * S, yN = LAND ? 450 * S : 690 * S;
    font(900, fs, false, -.05);
    const val = lerp(1, 3.7, E.outExpo(seg(t, 6.5, 7.1))).toFixed(1) + '×';
    rise(val, M - 8 * S, yN, fs, E.outExpo(seg(t, 6.45, 6.85)), C.good);
    const nw = ctx.measureText('3.7×').width;
    font(500, 22 * S, true, .14);
    rise('YOUR USUAL VIEWS', M, yN + 52 * S, 22 * S, E.outExpo(seg(t, 6.6, 6.95)), C.muted);
    // the creator's own words, never translated
    const quote = '“Aku sudah ada kawan baru..”';
    const n = Math.floor(quote.length * seg(t, 6.75, 7.15));
    font(500, 36 * S, false, -.01); ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    const qy = yN + 128 * S;
    if (n > 0) { ctx.fillText(quote.slice(0, n), M, qy); if (t < 7.3) { const cw = ctx.measureText(quote.slice(0, n)).width; ctx.fillStyle = C.good; ctx.fillRect(M + cw + 6 * S, qy - 28 * S, 16 * S, 32 * S); } }
    font(600, 46 * S, false, -.03);
    const ep = E.outExpo(seg(t, 7.1, 7.4));
    if (ep > 0) { ctx.fillStyle = C.bad; ctx.fillRect(M, qy + 58 * S, 18 * S * ep, 18 * S); }
    rise('No episode 2.', M + 32 * S, qy + 78 * S, 46 * S, ep, C.bad);
    // connector: number -> bar
    const cp = E.inOutCubic(seg(t, 6.85, 7.2));
    if (cp > 0) {
      const ly = clamp(btop + 40 * S, yN - fs * .62, yN - 16 * S), x1 = M + nw + 24 * S, x2 = br.x - br.w / 2 - 6 * S;
      ctx.fillStyle = C.ink; ctx.fillRect(x1, ly - 1 * S, (x2 - x1) * cp, 2 * S);
      if (cp >= 1) ctx.fillRect(x2 - 10 * S, ly - 5 * S, 10 * S, 10 * S);
    }
    ctx.restore();
  }
}

// =====================================================================
// 4. WE DON'T JUST MEASURE -> RESTRUCTURE -> SERIES  (7.5 – 10.7)
// =====================================================================
function sceneRestructure(t) {
  if (t < 7.9) {
    const g = E.inOutExpo(seg(t, 7.5, 7.83)), p = E.inOutExpo(seg(t, 7.56, 7.88));
    ctx.fillStyle = C.good; ctx.fillRect(0, H * (1 - g), W, H * g + 2);
    ctx.fillStyle = C.ink; ctx.fillRect(0, H * (1 - p), W, H * p + 2);
    return;
  }
  ctx.fillStyle = C.ink; ctx.fillRect(-60, -60, W + 120, H + 120);

  const fs = (LAND ? 150 : 116) * S;
  font(700, fs, false, -.045);
  const l1 = "We don't just", l2 = 'measure.', l3 = 'restructure.';
  const y1 = CY - fs * .15, y2 = CY + fs * .9, gc = CY + fs * .37;
  const g = E.inOutExpo(seg(t, 9.15, 9.6));
  const ty = LAND ? 175 * S : 340 * S;
  ctx.save();
  ctx.translate(CX, lerp(gc, ty, g)); ctx.scale(lerp(1, .42, g), lerp(1, .42, g)); ctx.translate(-CX, -gc);
  rise(l1, CX, y1, fs, E.outExpo(seg(t, 7.9, 8.4)), C.white, 'center');
  const w2 = ctx.measureText(l2).width;
  const fall = t - 8.66;
  if (fall < .6) {
    ctx.save();
    if (fall > 0) {
      const dy = -380 * S * fall + .5 * 6000 * S * fall * fall;
      ctx.globalAlpha = 1 - seg(fall, .3, .55);
      ctx.translate(CX, y2 - fs * .3 + dy); ctx.rotate(fall * 1.8); ctx.translate(-CX, -(y2 - fs * .3));
    }
    rise(l2, CX, y2, fs, E.outExpo(seg(t, 8.0, 8.5)), C.white, 'center');
    const sp = E.outExpo(seg(t, 8.4, 8.62));
    if (sp > 0) { ctx.fillStyle = C.dBad; ctx.fillRect(CX - w2 / 2 - 10 * S, y2 - fs * .33, (w2 + 20 * S) * sp, 13 * S); }
    ctx.restore();
  }
  // restructure. — letters arrive from the right one at a time
  if (t > 8.66) {
    const w3 = ctx.measureText(l3).width, left = CX - w3 / 2;
    ctx.textAlign = 'left'; ctx.fillStyle = C.dGood;
    for (let k = 0; k < l3.length; k++) {
      const cs = 8.68 + k * .018, cp = seg(t, cs, cs + .5); if (cp <= 0) continue;
      ctx.globalAlpha = seg(cp, 0, .15);
      ctx.fillText(l3[k], left + ctx.measureText(l3.slice(0, k)).width + (1 - E.outExpo(cp)) * W * .6, y2);
    }
    ctx.globalAlpha = 1;
    const st = seg(t, 9.0, 9.3);
    if (st > 0) {
      const sc = lerp(1.25, 1, E.outExpo(st)), pw = w3 + 50 * S, ph = fs * 1.1;
      ctx.save(); ctx.globalAlpha = st; ctx.translate(CX, y2 - fs * .33); ctx.scale(sc, sc);
      ctx.strokeStyle = C.dGood; ctx.lineWidth = 6 * S; ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      const s = 34 * S * E.outBack(seg(t, 9.12, 9.4), 3); ctx.fillStyle = C.dGood; ctx.fillRect(pw / 2 + 12 * S, -ph / 2 - 12 * S - s, s, s);
      ctx.restore();
    }
  }
  ctx.restore();

  // the series board: four weekly episodes of the story that worked
  const B = (LAND ? 230 : 205) * S, G2 = (LAND ? 28 : 20) * S, rowY = LAND ? CY + 40 * S : CY + 10 * S;
  const kick = E.outExpo(seg(t, 9.45, 9.8));
  if (kick > 0) { font(500, 18 * S, true, .14); rise('AHMAD STORY → WEEKLY SERIES', CX, rowY - B / 2 - 44 * S, 18 * S, kick, C.dMuted, 'center'); }
  for (let k = 0; k < 4; k++) {
    const ts = 9.4 + k * .1, p = seg(t, ts, ts + .26); if (t < ts) continue;
    const x = CX + (k - 1.5) * (B + G2);
    let y, sx, sy;
    if (p < 1) { const e = E.inCubic(p); y = lerp(-B, rowY, e); sx = 1 - .1 * e * e; sy = 1 + .25 * e * e; }
    else { const w = wobble(t - ts - .26, 3, 8); y = rowY; sx = 1 + .3 * w; sy = 1 - .3 * w; }
    const w = B * sx, h = B * sy, bx = x - w / 2, by = y + B / 2 - h;
    if (k === 0) {
      cover(STORY, bx, by, w, h);
      ctx.strokeStyle = C.dGood; ctx.lineWidth = 6 * S; ctx.strokeRect(bx, by, w, h);
      font(500, 18 * S, true, .1); ctx.fillStyle = C.dGood; ctx.fillRect(bx + 12 * S, by + 12 * S, 74 * S, 32 * S);
      ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.fillText('EP 1', bx + 49 * S, by + 34 * S);
    } else {
      const fp = E.outExpo(seg(t, 9.95 + k * .08, 10.3 + k * .08));
      ctx.fillStyle = C.dGoodSoft; ctx.fillRect(bx, by + h * (1 - fp), w, h * fp);
      ctx.save(); ctx.strokeStyle = C.dGood; ctx.lineWidth = 3 * S; ctx.setLineDash([10 * S, 8 * S]); ctx.strokeRect(bx, by, w, h); ctx.restore();
      font(500, 40 * S, true); ctx.fillStyle = C.dGood; ctx.textAlign = 'center'; ctx.fillText(`EP ${k + 1}`, x, by + h / 2 + 14 * S);
    }
    if (p >= 1) { font(500, 17 * S, true, .14); ctx.fillStyle = C.dMuted; ctx.textAlign = 'center'; ctx.globalAlpha = seg(t, ts + .26, ts + .4); ctx.fillText(`WEEK ${k + 1}`, x, rowY + B / 2 + 38 * S); ctx.globalAlpha = 1; }
  }
  // median target
  const mp = E.outExpo(seg(t, 9.95, 10.3));
  if (mp > 0) {
    const my = rowY + B / 2 + (LAND ? 200 : 210) * S, fs2 = 70 * S;
    font(500, 18 * S, true, .14); rise('MEDIAN VIEWS · 30 DAYS', CX, my - fs2 - 8 * S, 18 * S, mp, C.dMuted, 'center');
    font(600, fs2, false, -.03);
    const a = '327', b = fmt(lerp(327, 600, E.outExpo(seg(t, 10.0, 10.45)))), arrow = '  →  ';
    const wa = ctx.measureText(a).width, wr = ctx.measureText(arrow).width, wb = ctx.measureText('600').width;
    const left = CX - (wa + wr + wb) / 2;
    rise(a, left, my, fs2, mp, C.white);
    rise(arrow, left + wa, my, fs2, mp, C.dMuted);
    rise(b, left + wa + wr, my, fs2, E.outExpo(seg(t, 10.0, 10.3)), C.dGood);
  }
}

// =====================================================================
// 5. THE REPORT, TAB BY TAB  (10.45 – 12.62)
// =====================================================================
const BEAT = 60 / 190, T5 = 0.5 + 32 * BEAT, SL = BEAT; // tab cuts land on the 190 bpm grid
const TABS = ['Diagnosis', 'Profile', 'Timing', 'Competitors', 'Strategy'];
const SUBS = ['WHAT WORKS, WHAT SINKS', 'BIO, LINK, PINNED, GRID', 'YOUR BEST DAYS AND HOURS', '3 ACCOUNTS IN YOUR NICHE', 'PILLARS + NAMED SERIES'];
const DARKS = [false, true, false, true, false];
function tabLayout(k) {
  const fs = fitPx(TABS[k], 700, W * .76, 250 * S, -.05);
  font(700, fs, false, -.05);
  const w = ctx.measureText(TABS[k]).width - fs * .05;
  return { fs, w, left: CX - w / 2, y: CY + fs * .33 };
}
function slot(k, t) {
  const dark = DARKS[k], lt = t - (T5 + k * SL);
  const ink = dark ? C.white : C.ink, muted = dark ? C.dMuted : C.muted, good = dark ? C.dGood : C.good;
  ctx.fillStyle = dark ? C.ink : C.bg; ctx.fillRect(-60, -60, W + 120, H + 120);
  const { fs, w, left, y } = tabLayout(k), word = TABS[k];
  const charX = i => left + ctx.measureText(word.slice(0, i)).width;
  ctx.fillStyle = ink; ctx.textAlign = 'left';
  if (k === 0) rise(word, left, y, fs, E.outExpo(seg(lt, .02, .32)), ink);
  if (k === 1) {
    const s = lerp(1.6, 1, E.outExpo(seg(lt, .02, .34)));
    ctx.save(); ctx.globalAlpha = seg(lt, .02, .1); ctx.translate(CX, y - fs * .35); ctx.scale(s, s); ctx.translate(-CX, -(y - fs * .35)); ctx.fillText(word, left, y); ctx.restore();
  }
  for (let i = 0; i < word.length && k >= 2; i++) {
    const cs = .02 + i * (k === 3 ? .014 : .022), cp = seg(lt, cs, cs + .22); if (cp <= 0) continue;
    ctx.save(); ctx.globalAlpha = seg(cp, 0, .2);
    if (k === 2) ctx.fillText(word[i], charX(i), y - (1 - E.outBack(cp, 2)) * fs * .9);
    if (k === 3) ctx.fillText(word[i], charX(i) + (1 - E.outExpo(cp)) * W * .5, y);
    if (k === 4) { const sy = E.outBack(cp, 2.5); ctx.translate(0, y - fs * .35); ctx.scale(1, Math.max(sy, .001)); ctx.fillText(word[i], charX(i), fs * .35); }
    ctx.restore();
  }
  const lp = E.outExpo(seg(lt, .06, .34));
  font(500, 20 * S, true, .14);
  const sq = 16 * S * E.outBack(seg(lt, .04, .24), 3);
  ctx.fillStyle = good; ctx.fillRect(left, y - fs * .98 - sq, sq, sq);
  rise(`0${k + 1} / 05  ·  THE FULL REPORT`, left + 30 * S, y - fs * .98, 20 * S, lp, muted);
  rise(SUBS[k], left, y + 64 * S, 20 * S, E.outExpo(seg(lt, .1, .38)), muted);
  // progress: five segments
  const sw = 56 * S, sg = 8 * S, px = CX - (5 * sw + 4 * sg) / 2, py = H - (LAND ? 120 : 190) * S;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = dark ? C.dLine : C.line; ctx.fillRect(px + i * (sw + sg), py, sw, 4 * S);
    const f = i < k ? 1 : i === k ? E.outCubic(seg(lt, 0, SL)) : 0;
    ctx.fillStyle = good; ctx.fillRect(px + i * (sw + sg), py, sw * f, 4 * S);
  }
}
function tabMask(k, p) {
  ctx.beginPath();
  if (k === 0) {
    const e = E.outExpo(p), s = DIAG * 1.05 * e, a = (1 - e) * Math.PI / 2;
    const c = Math.cos(a), sn = Math.sin(a), h = s / 2;
    [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](CX + x * c - y * sn, CY + x * sn + y * c));
    ctx.closePath();
  } else if (k === 1) {
    const n = 7, h = H / n;
    for (let j = 0; j < n; j++) ctx.rect(0, j * h, W * E.outExpo(seg(p, j * .06, j * .06 + .6)), h + 1);
  } else if (k === 2) {
    const c = 135 * S, nx = Math.ceil(W / c), ny = Math.ceil(H / c);
    for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
      const d = (a + b) / (nx + ny) * .5, s = c * E.outExpo(seg(p, d, d + .5)) * 1.02;
      ctx.rect(a * c + c / 2 - s / 2, b * c + c / 2 - s / 2, s, s);
    }
  } else if (k === 3) {
    const sk = .3 * W, x = lerp(W + sk, -sk, E.outExpo(p));
    ctx.moveTo(x + sk, 0); ctx.lineTo(W + sk * 2, 0); ctx.lineTo(W + sk * 2, H); ctx.lineTo(x - sk, H); ctx.closePath();
  } else {
    const n = 9, w = W / n;
    for (let j = 0; j < n; j++) ctx.rect(j * w, 0, w + 1, H * E.outExpo(seg(p, j * .05, j * .05 + .6)));
  }
}
function sceneTabs(t) {
  const k = clamp(Math.floor((t - T5) / SL), 0, 4), lt = t - (T5 + k * SL), tp = seg(lt, 0, .24);
  if (tp >= 1) { slot(k, t); return; }
  if (k > 0) slot(k - 1, t);
  ctx.save(); tabMask(k, tp); ctx.clip(); slot(k, t); ctx.restore();
}

// =====================================================================
// 6. REDACT -> SQUARE -> LOGO  (12.45 – 15)
// =====================================================================
function sceneLogo(t) {
  const L = tabLayout(4);
  const wb = { x: L.left - 14 * S, y: L.y - L.fs * .8, w: L.w + 28 * S, h: L.fs * 1.02 };
  if (t < 12.62) { ctx.fillStyle = C.ink; ctx.fillRect(wb.x, wb.y, wb.w * E.outExpo(seg(t, 12.45, 12.62)), wb.h); return; }
  ctx.fillStyle = C.bg; ctx.fillRect(-60, -60, W + 120, H + 120);

  // lockup geometry (viewBox 0 -300 8378.41 1629.41; mark = 100 units scaled 10.29)
  const Lw = (LAND ? 1120 : 860) * S, k = Lw / 8378.41;
  const tagFs = (LAND ? 52 : 50) * S, lines = LAND ? 1 : 2;
  const groupH = 1041 * k + 100 * S + tagFs * 1.2 * lines + 90 * S;
  const top = CY - groupH / 2;
  const lx = CX - Lw / 2, ly = top - 300 * k;
  const ub = 280 * S / 68, uf = 10.29 * k;
  const g = E.inOutExpo(seg(t, 13.2, 13.75));
  const u = lerp(ub, uf, g), ox = lerp(CX - 34 * ub, lx, g), oy = lerp(CY - 66 * ub, ly + 300 * k, g);

  const push = 1 + .025 * E.outCubic(seg(t, 13.75, 15));
  ctx.save(); ctx.translate(CX, CY); ctx.scale(push, push); ctx.translate(-CX, -CY);

  if (t < 12.94) {
    // the redaction bar becomes the box
    const mp = E.inOutExpo(seg(t, 12.62, 12.94));
    const sq = { x: CX - 34 * ub, y: CY - 34 * ub, w: 68 * ub, h: 68 * ub };
    const r = lerpRect(wb, sq, mp);
    ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(Math.sin(Math.PI * mp) * .18);
    ctx.fillStyle = C.ink; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h); ctx.restore();
  } else {
    const d = t - 12.95, off = 32 * spring(d, 2.1, 6.5);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(u, u); ctx.fillStyle = C.ink;
    ctx.fill(MARK_L);
    if (d <= 0) ctx.fillRect(43, 32, 25, 25);
    ctx.fillStyle = mix(C.ink, C.good, seg(d, 0, .12) * (1 - seg(d, .5, .9)));
    ctx.fillRect(44 + off, 32 - off, 24, 24);
    ctx.restore();
    // speed lines at the pop
    const sp = seg(d, 0, .35);
    if (sp > 0 && sp < 1) {
      ctx.save(); ctx.translate(ox, oy); ctx.strokeStyle = C.good; ctx.lineWidth = 4 * S; ctx.globalAlpha = 1 - sp;
      [[-14, 0], [0, 0], [14, 0]].forEach(([dx], i) => {
        const a0 = 30 + E.outExpo(sp) * 40, a1 = 30 + E.outExpo(seg(sp, .15, 1)) * 40;
        ctx.beginPath(); ctx.moveTo((78 + dx * .5 + a1 * .7) * u, (24 + dx * .5 - a1 * .7 - 20) * u); ctx.lineTo((78 + dx * .5 + a0 * .7) * u, (24 + dx * .5 - a0 * .7 - 20) * u); ctx.stroke();
      });
      ctx.restore();
    }
  }

  // wordmark slides out from behind the mark
  const wp = E.outExpo(seg(t, 13.5, 14.15));
  if (wp > 0) {
    ctx.save(); ctx.translate(lx, ly + 300 * k); ctx.scale(k, k);
    ctx.beginPath(); ctx.rect(1110, -400, 8000, 2200); ctx.clip();
    ctx.translate(1276.41 - (1 - wp) * 6900, 1029.41); ctx.fillStyle = C.ink; ctx.fill(WORDMARK);
    ctx.restore();
  }

  // tagline — the site's hero line; "pop" springs up, "sink." slowly drops
  const words = 'See why some videos pop and the rest sink.'.split(' ');
  font(600, tagFs, false, -.03);
  const rows = LAND ? [words] : [words.slice(0, 5), words.slice(5)];
  let idx = 0;
  const ty0 = ly + 1341 * k + 100 * S + tagFs;
  rows.forEach((row, ri) => {
    const sp = ctx.measureText(' ').width;
    const total = row.reduce((a, w) => a + ctx.measureText(w).width, 0) + sp * (row.length - 1);
    let x = CX - total / 2;
    const y = ty0 + ri * tagFs * 1.2;
    row.forEach(w => {
      const st = 13.9 + idx * .055, p = seg(t, st, st + .6), e = E.outExpo(p);
      const ww = ctx.measureText(w).width;
      if (p > 0) {
        ctx.save(); ctx.globalAlpha = seg(p, 0, .4);
        const blur = (1 - e) * 8 * S; if (blur > .3) ctx.filter = `blur(${blur}px)`;
        let dy = (1 - e) * tagFs * .5, rot = 0, col = C.ink;
        if (w === 'pop') { col = C.good; dy -= tagFs * .12 * spring(t - 14.45, 2.6, 5); }
        if (w === 'sink.') { col = C.bad; const s = E.outCubic(seg(t, 14.55, 15)); dy += tagFs * .12 * s; rot = .07 * s; }
        ctx.translate(x + ww / 2, y + dy); ctx.rotate(rot); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(w, 0, 0);
        ctx.restore();
      }
      x += ww + sp; idx++;
    });
  });

  // url
  const up = E.outExpo(seg(t, 14.35, 14.8));
  if (up > 0) {
    font(500, 24 * S, true, .16);
    const url = 'RUANGKOTAK.COM', uw = ctx.measureText(url).width, uy = ty0 + (lines - 1) * tagFs * 1.2 + 90 * S;
    const s = 14 * S * E.outBack(seg(t, 14.35, 14.6), 3);
    ctx.fillStyle = C.good; ctx.fillRect(CX - uw / 2 - 28 * S, uy - 16 * S, s, s);
    rise(url, CX - uw / 2, uy, 24 * S, up, C.ink);
  }
  ctx.restore();
}

// =====================================================================
// HUD: crop marks, timecode, chapter. Difference-blended so it reads on any ground.
// =====================================================================
const CHAPTERS = [[0, 'DROP'], [1.4, 'SCAN'], [3.45, 'READ'], [7.6, 'RESTRUCTURE'], [10.605, 'REPORT'], [12.45, 'RESOLVE']];
function hud(t) {
  const a = seg(t, .05, .4) * (1 - seg(t, 13.6, 14.1));
  if (a <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.globalAlpha = .55 * a; ctx.fillStyle = '#ffffff';
  const m = 40 * S, len = 22 * S, lw = 2 * S;
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, dx, dy]) => {
    ctx.fillRect(Math.min(x, x + dx * len), y - (dy < 0 ? lw : 0), len, lw);
    ctx.fillRect(x - (dx < 0 ? lw : 0), Math.min(y, y + dy * len), lw, len);
  });
  font(500, 15 * S, true, .16);
  const f = Math.floor(t * 60);
  const tc = `00:00:${String(Math.floor(f / 60)).padStart(2, '0')}:${String(f % 60).padStart(2, '0')}`;
  const ch = CHAPTERS.filter(c => t >= c[0]).length;
  ctx.textAlign = 'left'; ctx.fillText('RUANGKOTAK — REEL 2026', m + 34 * S, m + 16 * S);
  ctx.textAlign = 'right'; ctx.fillText(tc, W - m - 34 * S, m + 16 * S);
  ctx.textAlign = 'left'; ctx.fillText(`0${ch} ${CHAPTERS[ch - 1][1]}`, m + 34 * S, H - m - 6 * S);
  ctx.textAlign = 'right'; ctx.fillText('ACCOUNT DIAGNOSIS · IG / TIKTOK', W - m - 34 * S, H - m - 6 * S);
  ctx.restore();
}

// =====================================================================
function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = C.ink; ctx.fillRect(-60, -60, W + 120, H + 120);
  const [sx, sy] = shake(t);
  ctx.save(); ctx.translate(sx, sy);
  if (t < 3.95) sceneGrid(t);
  if (t >= 3.45 && t < 7.9) sceneBars(t);
  if (t >= 7.5 && t < T5 + .3) sceneRestructure(t);
  if (t >= T5 && t < 12.62) sceneTabs(t);
  if (t >= 12.45) sceneLogo(t);
  ctx.restore();
  hud(t);
}
window.draw = draw;
window.ready = Promise.all([
  ...REELS.map(r => r.img.decode()),
  ...['400', '500', '600', '700', '900'].map(w => document.fonts.load(`${w} 100px G`)),
  document.fonts.load('500 100px GM'),
]).then(() => { draw(+(q.get('t') || 0)); return true; });
})();
