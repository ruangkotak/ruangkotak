// @ts-nocheck -- ported verbatim from the approved static design; plain DOM + GSAP.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

export type LandingHooks = {
  /** Opens the preview sheet. Returns false while the funnel is closed. */
  start: (platform: "tiktok" | "instagram", handle: string) => boolean;
  /** Set by initLanding: shows a server-side handle rejection under the form that sent it. */
  reject?: (text: string) => void;
};

export function initLanding(hooks: LandingHooks) {
let alive = true;
let lenis;
const offs = [];
const on = (type, fn, opts) => { addEventListener(type, fn, opts); offs.push(() => removeEventListener(type, fn, opts)); };
const tick = fn => { gsap.ticker.add(fn); offs.push(() => gsap.ticker.remove(fn)); };
const ctx = gsap.context(() => {
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (RM) document.documentElement.classList.add('rm');
gsap.registerPlugin(ScrollTrigger);
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const mobile = () => innerWidth < 820;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ---------- smooth scroll ---------- */
if (!RM) {
  lenis = new Lenis({ lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  on('rk:sheet', e => e.detail ? lenis.stop() : lenis.start());
  tick(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href'); if (id.length < 2 || !lenis) return;
  e.preventDefault(); lenis.scrollTo(id === '#top' ? 0 : id, { duration: 1.6 });
}));

/* ---------- nav ---------- */
let lastY = 0;
ScrollTrigger.create({ start: 0, end: 'max', onUpdate: s => {
  $('#prog').style.transform = `scaleX(${s.progress})`;
  const y = s.scroll(); $('#nav').classList.toggle('hide', y > lastY && y > 400); lastY = y;
}});

/* ---------- cursor + magnetic ---------- */
const cur = $('#cur');
if (matchMedia('(hover:hover)').matches) {
  const qx = gsap.quickTo(cur, 'x', { duration: .25, ease: 'power3' }), qy = gsap.quickTo(cur, 'y', { duration: .25, ease: 'power3' });
  on('pointermove', e => { qx(e.clientX); qy(e.clientY); });
  $$('[data-cursor]').forEach(el => {
    el.addEventListener('pointerenter', () => { cur.classList.add('big'); cur.firstElementChild.textContent = el.dataset.cursor; });
    el.addEventListener('pointerleave', () => cur.classList.remove('big'));
  });
  $$('[data-mag]').forEach(el => {
    const mx = gsap.quickTo(el, 'x', { duration: .5, ease: 'elastic.out(1,.4)' }), my = gsap.quickTo(el, 'y', { duration: .5, ease: 'elastic.out(1,.4)' });
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); mx((e.clientX - r.left - r.width / 2) * .3); my((e.clientY - r.top - r.height / 2) * .4); });
    el.addEventListener('pointerleave', () => { mx(0); my(0); });
  });
}

/* ---------- cube: six faces of nine posts, hinged so it can unfold into a flat net ---------- */
const cube = $('#cube');
const faces = Object.fromEntries($$('.face').map(f => [f.dataset.f, f]));
const tiles = [];
['front', 'left', 'top', 'bottom', 'right', 'back'].forEach(k => {
  for (let i = 0; i < 9; i++) {
    const t = document.createElement('div'); t.className = 't';
    const v = rnd(); t.textContent = (v * 40 + 1).toFixed(1) + 'k';
    t._beat = v > .62; faces[k].insertBefore(t, faces[k].querySelector('.face')); tiles.push(t);
  }
});
tiles.forEach(t => t._o = rnd());
const beatN = tiles.filter(t => t._beat).length;
const bestTile = tiles.filter(t => t._beat).sort((a, b) => parseFloat(b.textContent) - parseFloat(a.textContent))[0];

const S = () => cube.offsetWidth;
function sizeCube() {
  const s = mobile() ? Math.min(innerWidth * .36, 170) : Math.min(innerWidth * .2, innerHeight * .26, 260);
  document.documentElement.style.setProperty('--s', s + 'px');
}
sizeCube();
const C = { p: 0, k: 0, sc: 1, y: 0 };
let t0 = 0, mx = 0, my = 0;
on('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
const sm = { mx: 0, my: 0 };
function renderCube(dt) {
  const s = S(), a = 90 * (1 - C.p);
  if (C.k === 0 && !RM) t0 += dt;
  sm.mx += (mx - sm.mx) * .06; sm.my += (my - sm.my) * .06;
  let ry = -32 + t0 * 14 + sm.mx * 40; ry = ((ry + 180) % 360 + 360) % 360 - 180;
  const rx = -24 - sm.my * 20;
  cube.style.transformOrigin = `50% 50% ${-s / 2}px`;
  cube.style.transform = `translateY(${C.y}px) scale(${C.sc}) translateX(${-s / 2 * C.p}px) rotateX(${rx * (1 - C.k)}deg) rotateY(${ry * (1 - C.k)}deg)`;
  faces.left.style.cssText = `transform-origin:100% 50%;transform:translateX(${-s}px) rotateY(${-a}deg)`;
  faces.right.style.cssText = `transform-origin:0 50%;transform:translateX(${s}px) rotateY(${a}deg)`;
  faces.back.style.cssText = `inset:-1px;transform-origin:0 50%;transform:translateX(${s}px) rotateY(${a}deg)`;
  faces.top.style.cssText = `transform-origin:50% 100%;transform:translateY(${-s}px) rotateX(${a}deg)`;
  faces.bottom.style.cssText = `transform-origin:50% 0;transform:translateY(${s}px) rotateX(${-a}deg)`;
}
let lastT = performance.now();
tick(() => { const n = performance.now(); renderCube(Math.min((n - lastT) / 1000, .05)); lastT = n; });
function lightTiles(v) {
  tiles.forEach(t => t.classList.toggle('on', t._beat && t !== bestTile && v > t._o * .85));
  bestTile.classList.toggle('best', v > .9);
  $('#tl').textContent = v > .02 ? $$('.t.on, .t.best').length : 54;
  $('#tl').nextSibling.textContent = v > .02 ? 'above your usual' : 'videos read';
  $('#tl2').textContent = v > .02 ? `of 54 videos` : '6 faces × 9 posts';
}

/* ---------- hero intro ---------- */
(function splitWords(el) {
  const walk = n => [...n.childNodes].forEach(c => {
    if (c.nodeType === 3) {
      const frag = document.createDocumentFragment();
      c.textContent.split(/(\s+)/).forEach(w => {
        if (!w) return;
        if (/^\s+$/.test(w)) { frag.append(w); return; }
        const o = document.createElement('span'); o.className = 'w'; const i = document.createElement('span'); i.textContent = w; o.append(i); frag.append(o);
      });
      c.replaceWith(frag);
    } else if (c.nodeType === 1) walk(c);
  });
  walk(el);
})($('#h1'));

function introAndHero() {
  const tl = gsap.timeline();
  if (!RM) {
    const ir = $('#ir');
    gsap.set(ir, { strokeDasharray: 476, strokeDashoffset: 476 });
    gsap.set('.il', { strokeDasharray: 120, strokeDashoffset: 120 });
    const cnt = { v: 0 };
    tl.to(ir, { strokeDashoffset: 0, duration: .9, ease: 'power2.inOut' })
      .to(cnt, { v: 100, duration: 1.3, ease: 'power2.inOut', onUpdate: () => $('#ic').textContent = String(Math.round(cnt.v)).padStart(3, '0') }, 0)
      .to('.il', { strokeDashoffset: 0, duration: .5, stagger: .06, ease: 'power2.out' }, .55)
      .to('#intro svg', { rotate: 90, scale: .4, duration: .7, ease: 'expo.inOut' }, 1.2)
      .to('#intro', { clipPath: 'inset(0 0 100% 0)', duration: .9, ease: 'expo.inOut' }, 1.5)
      .set('#intro', { display: 'none' });
  }
  const at = RM ? 0 : 1.75;
  tl.from('#h1 .w>span', { yPercent: 115, rotate: 4, duration: 1.1, stagger: .05, ease: 'expo.out' }, at)
    .from('.hero-txt .eyebrow, .hero-txt p, .hero-txt .hero-cta', { y: 20, opacity: 0, duration: .9, stagger: .08, ease: 'power3.out' }, at + .25)
    .to('.mark', { '--mk': 1, duration: .8, ease: 'power3.inOut' }, at + .7)
    .from('.hero-bars i', { scaleX: 0, duration: .9, stagger: .1, ease: 'expo.out' }, at + .5)
    .from('.hero-meta, .cap, .tally', { opacity: 0, y: 12, duration: .9 }, at + .7)
    .from(C, { sc: .15, duration: 1.8, ease: 'expo.out' }, at + .1)
    .from('#checker', { scale: .6, opacity: 0, duration: 1.4, ease: 'expo.out' }, at + .2);
  if (RM) tl.progress(1);
}

function placeCube() {
  const tb = $('.hero-txt').getBoundingClientRect().bottom;
  C.y = tb + 28 + S() * .95 - innerHeight / 2;
  gsap.set('#checker', { y: C.y });
}
function unboxScroll() {
  placeCube();
  if (RM) return;
  const net = Math.min((innerWidth * .9) / (4 * S()), (innerHeight * .64) / (3 * S()), 1.6);
  const caps = $$('.cap p'), up = mobile() ? -innerHeight * .08 : -innerHeight * .03;
  const tl = gsap.timeline({ scrollTrigger: { trigger: '#unbox', start: 'top top', end: '+=180%', pin: true, scrub: 1 } });
  tl.to('.hero-txt', { y: -140, opacity: 0, duration: .5, ease: 'power2.in' }, 0)
    .to('.hero-bars, .hero-meta', { opacity: 0, duration: .3 }, 0)
    .to(C, { y: up, sc: 1.15, duration: .7, ease: 'power2.inOut' }, 0)
    .to('#checker', { y: up, scale: 1.15, duration: .6, ease: 'power2.inOut' }, 0)
    .to('#checker', { opacity: 0, scale: 1.7, duration: .4 }, .6)
    .to('.cap', { opacity: 1, duration: .2 }, .5)
    .to(C, { k: 1, duration: .5, ease: 'power2.inOut' }, .55)
    .to(C, { p: 1, sc: net, duration: .9, ease: 'power3.inOut' }, .75)
    .to(caps[0], { opacity: 0, y: -10, duration: .2 }, .7)
    .fromTo(caps[1], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .25 }, .85)
    .to(caps[1], { opacity: 0, y: -10, duration: .2 }, 1.6)
    .fromTo(caps[2], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .25 }, 1.75)
    .fromTo({ v: 0 }, { v: 0 }, { v: 1, duration: .8, ease: 'none', onUpdate() { lightTiles(this.targets()[0].v); } }, 1.7)
    .to({}, { duration: .3 });
}

/* ---------- sort field: 100 boxes, scatter → timeline → content-type columns ---------- */
// Labels match the content types the TypeSafe tagger assigns in real reports (lib/tagger.ts).
const TYPES = [['How-to', 19, 14], ['Verdicts', 28, 7], ['Vlogs', 22, 6], ['First looks', 17, 5], ['Lists', 14, 4]];
const field = $('#field'), boxes = [];
const seq = [];
TYPES.forEach(([, c, b], ti) => { for (let i = 0; i < c; i++) seq.push({ ti, beat: i < b }); });
for (let i = seq.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [seq[i], seq[j]] = [seq[j], seq[i]]; }
seq.forEach(d => { const el = document.createElement('div'); el.className = 'bx'; el.ti = d.ti; el.beat = d.beat; el._sc = rnd(); el._r = rnd(); el._x = rnd(); el._y = rnd(); field.append(el); boxes.push(el); });
const labels = TYPES.map(([n, c]) => { const l = document.createElement('div'); l.className = 'collab'; l.innerHTML = `${n}<small>${c}</small><span class="u"></span>`; field.append(l); return l; });
function buildSort() {
  const sec = $('#sort'), topB = $('#sort .top').getBoundingClientRect().bottom - sec.getBoundingClientRect().top;
  field.style.top = (topB + (mobile() ? 20 : 36)) + 'px';
  const W = Math.min(innerWidth - (mobile() ? 32 : 96), 1240), H = field.clientHeight;
  field.style.width = W + 'px';
  const g = mobile() ? 3 : 5, cols = mobile() ? 10 : 20, rows = 100 / cols;
  const sub = mobile() ? 3 : 4, cg = mobile() ? 8 : 36, colW = (W - cg * 4) / 5;
  const base = H - 40;
  const bGrid = Math.min((W - g * (cols - 1)) / cols, (base - g * (rows - 1)) / rows);
  const bCol = Math.min((colW - g * (sub - 1)) / sub, (base - 10) / Math.ceil(28 / sub) - g);
  const b = Math.floor(Math.min(bGrid, bCol));
  const gx = (W - (cols * b + (cols - 1) * g)) / 2, gy = (base - (rows * b + (rows - 1) * g)) / 2;
  const rank = TYPES.map(() => 0), colPos = new Map();
  [...boxes].sort((a, c) => c.beat - a.beat).forEach(el => colPos.set(el, rank[el.ti]++));
  boxes.forEach((el, i) => {
    el.style.width = el.style.height = b + 'px';
    el.S = { x: el._x * (W - b), y: el._y * (base - b), rotation: el._r * 70 - 35, scale: .45 + el._sc * .6 };
    el.G = { x: gx + (i % cols) * (b + g), y: gy + Math.floor(i / cols) * (b + g) };
    const r = colPos.get(el), cx = el.ti * (colW + cg) + (colW - (sub * b + (sub - 1) * g)) / 2;
    el.Cp = { x: cx + (r % sub) * (b + g), y: base - (Math.floor(r / sub) + 1) * (b + g) + g };
  });
  labels.forEach((l, i) => { l.style.left = (i * (colW + cg)) + 'px'; l.style.width = colW + 'px'; l.style.top = (base + 8) + 'px'; });
  const scaps = $$('.scap p');
  if (RM) {
    boxes.forEach(el => { gsap.set(el, el.Cp); if (el.beat) gsap.set(el, { background: '#2c2c26', borderColor: '#2c2c26' }); });
    $('#sn').textContent = 14; return;
  }
  boxes.forEach(el => gsap.set(el, { ...el.S, background: '#fff', borderColor: '#57584b', opacity: 1 }));
  gsap.set(scaps, { opacity: 0 }); gsap.set(scaps[0], { opacity: 1 });
  gsap.timeline({ scrollTrigger: { trigger: '#sort', start: 'top top', end: '+=280%', pin: true, scrub: 1 } })
    .to(boxes, { x: (i, el) => el.S.x + (el._x - .5) * 60, y: (i, el) => el.S.y + (el._y - .5) * 60, rotation: (i, el) => el.S.rotation * 1.4, duration: 1, ease: 'none' })
    .to(boxes, { x: (i, el) => el.G.x, y: (i, el) => el.G.y, rotation: 0, scale: 1, duration: 1.4, ease: 'power3.inOut', stagger: { each: .008, from: 'random' } })
    .to(scaps[0], { opacity: 0, duration: .2 }, '<').to(scaps[1], { opacity: 1, duration: .3 }, '<+.1')
    .to(boxes.filter(e => e.beat), { background: '#2c2c26', borderColor: '#2c2c26', duration: .3, stagger: .015 })
    .to({}, { duration: .4 })
    .to(boxes, { x: (i, el) => el.Cp.x, y: (i, el) => el.Cp.y, duration: 1.6, ease: 'power3.inOut', stagger: { each: .01 } })
    .to(scaps[1], { opacity: 0, duration: .2 }, '<').to(scaps[2], { opacity: 1, duration: .3 }, '<+.1')
    .to(labels, { opacity: 1, duration: .4, stagger: .08 }, '-=.6')
    .to({}, { duration: .5 })
    .to(boxes.filter(e => e.ti !== 0), { opacity: .22, duration: .5 })
    .to(labels.slice(1), { opacity: .35, duration: .5 }, '<')
    .to(labels[0].querySelector('.u'), { scaleX: 1, duration: .5 }, '<')
    .to(scaps[2], { opacity: 0, duration: .2 }, '<').to(scaps[3], { opacity: 1, duration: .3 }, '<+.1')
    .to('.stat', { opacity: 1, duration: .3 }, '<')
    .fromTo({ v: 0 }, { v: 0 }, { v: 14, duration: .6, onUpdate() { $('#sn').textContent = Math.round(this.targets()[0].v); } }, '<')
    .to({}, { duration: .6 });
}

unboxScroll(); buildSort();

/* ---------- marquee (speeds up and skews with scroll velocity) ---------- */
const niches = ['Food', 'Beauty', 'Fashion', 'Fitness', 'Health', 'Travel', 'Tech', 'Gaming', 'Automotive', 'Comedy', 'Music', 'Dance', 'Education', 'Finance', 'Business', 'Parenting', 'Pets', 'Sports', 'Lifestyle', 'Home & DIY', 'Art'];
const row = $('#marq'); row.innerHTML = [...niches, ...niches].map(n => `<span>${n}</span>`).join('');
let mxp = 0, vel = 0;
if (!RM) {
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: s => { vel = s.getVelocity() / 300; } });
  tick(() => {
    const half = row.scrollWidth / 2; vel *= .92;
    mxp -= .6 + Math.abs(vel); if (-mxp > half) mxp += half;
    row.style.transform = `translateX(${mxp}px) skewX(${gsap.utils.clamp(-8, 8, -vel)}deg)`;
  });
}

/* ---------- method ---------- */
function stepAnim(step) {
  const k = step.dataset.step, tl = gsap.timeline({ paused: true });
  if (k === 'log') tl.to($$('.log div', step), { opacity: 1, duration: .3, stagger: .25 });
  if (k === 'chips') tl.fromTo($$('.chips span', step), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .25, stagger: .07 });
  if (k === 'vs') tl.from($$('.vs>div', step), { y: 30, opacity: 0, duration: .7, stagger: .15, ease: 'expo.out' });
  if (k === 'target') tl.from($('[data-to]', step), { textContent: 0, duration: 1, snap: { textContent: 1 } }).to($('.meter i', step), { width: '100%', duration: 1.2, ease: 'power2.inOut' }, 0);
  return tl;
}
const steps = $$('.step'), stepTLs = steps.map(stepAnim);
const mm = gsap.matchMedia();
mm.add('(min-width: 821px)', () => {
  if (RM) { stepTLs.forEach(t => t.progress(1)); return; }
  const track = $('#track');
  const dist = () => track.scrollWidth - innerWidth;
  const tween = gsap.to(track, { x: () => -dist(), ease: 'none',
    scrollTrigger: { trigger: '#method', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true } });
  steps.forEach((s, i) => {
    ScrollTrigger.create({ trigger: s, containerAnimation: tween, start: 'left 80%', onEnter: () => stepTLs[i].play() });
    gsap.from($('.n', s), { yPercent: 60, opacity: 0, ease: 'none', scrollTrigger: { trigger: s, containerAnimation: tween, start: 'left right', end: 'left 45%', scrub: true } });
  });
});
mm.add('(max-width: 820px)', () => {
  if (RM) { stepTLs.forEach(t => t.progress(1)); return; }
  steps.forEach((s, i) => ScrollTrigger.create({ trigger: s, start: 'top 70%', once: true, onEnter: () => stepTLs[i].play() }));
});

/* ---------- report tabs ---------- */
const heat = $('#heat'), days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
heat.innerHTML = '<span></span>' + Array.from({ length: 12 }, (_, i) => `<span>${String(i * 2).padStart(2, '0')}</span>`).join('');
days.forEach((d, di) => {
  heat.insertAdjacentHTML('beforeend', `<span>${d}</span>`);
  for (let h = 0; h < 12; h++) {
    const eve = Math.exp(-((h - 10.5) ** 2) / 3), noon = Math.exp(-((h - 6) ** 2) / 2) * .5;
    const v = Math.min(1, (eve + noon) * (di === 3 || di === 5 ? 1.1 : .75) + rnd() * .15);
    const pk = di === 3 && h === 10;
    heat.insertAdjacentHTML('beforeend', `<i class="${pk ? 'pk' : ''}" data-o="${pk ? 1 : (.06 + v * .9).toFixed(2)}"></i>`);
  }
});
$$('.crow .dots').forEach(d => { d.innerHTML = Array.from({ length: +d.dataset.of }, (_, i) => `<i class="${i < +d.dataset.n ? 'k' : ''}"></i>`).join(''); });

const paneAnim = {
  diag: p => gsap.timeline()
    .fromTo($('.fg', p), { strokeDashoffset: 100 }, { strokeDashoffset: 32, duration: 1.4, ease: 'power3.inOut' })
    .fromTo($('[data-to]', p), { textContent: 0 }, { textContent: 68, duration: 1.4, snap: { textContent: 1 }, ease: 'power3.inOut' }, 0)
    .fromTo($$('.hbar i', p), { width: 0 }, { width: (i, el) => el.dataset.w + '%', duration: 1, stagger: .08, ease: 'expo.out' }, .2)
    .fromTo($('.fix', p), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: .6 }, .8),
  prof: p => gsap.timeline().fromTo($$('.check li', p), { opacity: 0, x: -14 }, { opacity: 1, x: 0, stagger: .12, duration: .5 })
    .fromTo($$('.grid9 i', p), { scale: 0 }, { scale: 1, duration: .5, stagger: .05, ease: 'back.out(2)' }, 0),
  time: p => gsap.timeline().fromTo($$('.heat i', p), { opacity: 0, scale: .4 }, { opacity: (i, el) => +el.dataset.o, scale: 1, duration: .4, stagger: { each: .006, grid: [7, 12], from: 'start' } }),
  comp: p => gsap.timeline().fromTo($$('.crow:not(.h)', p), { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: .1, duration: .5 })
    .fromTo($$('.crow .dots i', p), { scaleY: 0 }, { scaleY: 1, transformOrigin: 'bottom', stagger: .004, duration: .3 }, .1),
  strat: p => gsap.timeline().fromTo($$('.pill', p), { opacity: 0, y: 30, rotate: i => (i - 1) * 3 }, { opacity: 1, y: 0, rotate: 0, stagger: .12, duration: .8, ease: 'expo.out' }),
};
const ink = $('#tabs .ink');
const moveInk = btn => { ink.style.left = btn.offsetLeft + 14 + 'px'; ink.style.width = btn.offsetWidth - 28 + 'px'; };
function showTab(btn) {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b === btn)); moveInk(btn);
  $$('.pane').forEach(p => p.classList.toggle('on', p.dataset.p === btn.dataset.t));
  const tl = paneAnim[btn.dataset.t]($(`.pane[data-p="${btn.dataset.t}"]`)); if (RM) tl.progress(1);
}
$$('#tabs button').forEach(b => b.addEventListener('click', () => showTab(b)));
moveInk($('#tabs button'));
if (RM) showTab($('#tabs button.on'));
else ScrollTrigger.create({ trigger: '#report .panel', start: 'top 70%', once: true, onEnter: () => showTab($('#tabs button.on')) });

/* ---------- reveals ---------- */
if (!RM) {
  gsap.from('#report .panel', { y: 80, rotateX: 8, transformPerspective: 1600, transformOrigin: '50% 0', opacity: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '#report .panel', start: 'top 85%' } });
  $$('.head, #start .wrap').forEach(h => {
    gsap.from($$('.reveal-line>span', h), { yPercent: 110, duration: 1.1, stagger: .08, ease: 'expo.out', scrollTrigger: { trigger: h, start: 'top 80%' } });
    if ($$(':scope > p', h).length) gsap.from($$(':scope > p', h), { y: 16, opacity: 0, duration: .9, delay: .2, scrollTrigger: { trigger: h, start: 'top 80%' } });
  });
  const glyphs = '□■▪▫01/—';
  $$('[data-scr]').forEach(el => {
    const txt = el.textContent;
    ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => {
      const o = { p: 0 }; gsap.to(o, { p: 1, duration: .9, ease: 'none', onUpdate: () => {
        const n = Math.floor(o.p * txt.length);
        el.textContent = txt.slice(0, n) + [...txt.slice(n)].map(c => c === ' ' ? ' ' : glyphs[Math.floor(Math.random() * glyphs.length)]).join('');
      }, onComplete: () => el.textContent = txt });
    }});
  });
  gsap.from('.rung', { y: 70, opacity: 0, duration: 1.1, stagger: .12, ease: 'expo.out', scrollTrigger: { trigger: '.ladder', start: 'top 80%' } });
  gsap.from('#wire', { scaleX: 0, duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: '.ladder', start: 'top 80%' } });
  if (matchMedia('(hover:hover)').matches) $$('.rung').forEach(r => {
    r.addEventListener('pointermove', e => { const b = r.getBoundingClientRect(); gsap.to(r, { rotateY: ((e.clientX - b.left) / b.width - .5) * 6, rotateX: -((e.clientY - b.top) / b.height - .5) * 6, y: -6, transformPerspective: 900, duration: .5 }); });
    r.addEventListener('pointerleave', () => gsap.to(r, { rotateX: 0, rotateY: 0, y: 0, duration: .8, ease: 'elastic.out(1,.5)' }));
  });
}

/* ---------- faq ---------- */
$$('.q').forEach(q => $('button', q).addEventListener('click', () => {
  const open = !q.classList.contains('open');
  $$('.q.open').forEach(o => { if (o !== q) { o.classList.remove('open'); gsap.to($('.a', o), { height: 0, duration: .6, ease: 'expo.inOut' }); } });
  q.classList.toggle('open', open);
  gsap.to($('.a', q), { height: open ? 'auto' : 0, duration: .7, ease: 'expo.inOut', onComplete: () => ScrollTrigger.refresh() });
}));

/* ---------- cta flyers + form ---------- */
const fly = $('#flyers');
for (let i = 0; i < 26; i++) {
  const b = document.createElement('i'), s = 10 + rnd() * 34;
  Object.assign(b.style, { left: rnd() * 100 + '%', top: rnd() * 100 + '%', width: s + 'px', height: s + 'px' });
  if (i % 7 === 0) Object.assign(b.style, { background: 'var(--carbon)', borderColor: 'var(--carbon)' });
  if (i === 12) Object.assign(b.style, { background: 'var(--hi)', borderColor: 'var(--ink)' });
  fly.append(b);
  if (!RM) gsap.fromTo(b, { y: 160 * (rnd() + .3), rotate: rnd() * 90 }, { y: -160 * (rnd() + .3), rotate: -rnd() * 90, ease: 'none', scrollTrigger: { trigger: '#start', start: 'top bottom', end: 'bottom top', scrub: true } });
}
let lastMsg = null;
const say = (el, text, err) => { if (!el) return; el.textContent = text; el.classList.toggle('err', !!err); };
hooks.reject = text => { say(lastMsg, text, true); lastMsg?.previousElementSibling?.h?.focus(); };
$$('[data-form]').forEach(f => f.addEventListener('submit', e => {
  e.preventDefault();
  const v = f.h.value.trim().replace(/^@/, ''), p = $('input[name=p]:checked', f)?.value || 'tiktok';
  lastMsg = f.nextElementSibling;
  if (!/^[A-Za-z0-9._]{2,30}$/.test(v)) {
    gsap.fromTo($('.handle', f), { x: -8 }, { x: 0, duration: .6, ease: 'elastic.out(1,.3)' }); f.h.focus();
    say(lastMsg, 'Enter a handle like yourname, without spaces.', true); return;
  }
  say(lastMsg, '');
  if (!hooks.start(p, v)) say(lastMsg, 'Work in progress: the free diagnosis opens soon.');
}));

/* ---------- footer wordmark ---------- */
$('#wm').innerHTML = [...'RUANGKOTAK'].map(c => `<span>${c}</span>`).join('');
if (!RM) gsap.from('#wm span', { yPercent: 100, rotate: 6, ease: 'none', stagger: .05, scrollTrigger: { trigger: 'footer', start: 'top 85%', end: 'bottom bottom', scrub: 1 } });

/* ---------- boot ---------- */
document.fonts.ready.then(() => { if (!alive) return; ctx.add(() => { if (!scrollY) placeCube(); ScrollTrigger.refresh(); introAndHero(); }); });
let rw = innerWidth;
on('resize', () => { if (Math.abs(innerWidth - rw) > 40) location.reload(); });
});
return () => {
  alive = false;
  offs.forEach(f => f());
  ctx.revert();
  ScrollTrigger.getAll().forEach(t => t.kill(true));
  lenis?.destroy();
};
}
