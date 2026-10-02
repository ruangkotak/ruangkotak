"use client";

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef } from "react";

// Illustration only: 100 made-up videos from five content types. The story it tells is the one
// most accounts have: the type posted least often is the one carrying the account.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PILLARS = ["How-to", "Reviews", "Vlogs", "Trends", "Q&A"];
const COUNTS = [16, 28, 22, 20, 14];
const MEANS = [1.05, -0.05, -0.4, 0.2, -0.55];
const WIN = 0;

type Cell = { p: number; m: number; k: number; sx: number; sy: number; sr: number; ss: number; jx: number; d: number };

const CELLS: Cell[] = (() => {
  const r = rng(7);
  const pillars = COUNTS.flatMap((c, p) => Array<number>(c).fill(p));
  for (let i = pillars.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pillars[i], pillars[j]] = [pillars[j], pillars[i]];
  }
  const raw = pillars.map((p) => Math.exp(MEANS[p] + (r() + r() + r() - 1.5) * 0.95));
  const median = [...raw].sort((a, b) => a - b)[50];
  const cells = pillars.map((p, i) => ({
    p,
    m: raw[i] / median,
    k: 0,
    sx: -0.6 + r() * 12,
    sy: -0.6 + r() * 12,
    sr: (r() - 0.5) * 140,
    ss: 0.3 + r() * 0.55,
    jx: r() - 0.5,
    d: r(),
  }));
  // Rank inside each content type, best first, so the stacks and the strip read top-down.
  PILLARS.forEach((_, p) =>
    cells
      .map((c, i) => [c.m, i] as const)
      .filter(([, i]) => cells[i].p === p)
      .sort((a, b) => b[0] - a[0])
      .forEach(([, i], k) => (cells[i].k = k)),
  );
  return cells;
})();

const BEST = CELLS.reduce((b, c, i) => (c.m > CELLS[b].m ? i : b), 0);
const WIN_MEDIAN = (() => {
  const ms = CELLS.filter((c) => c.p === WIN).map((c) => c.m).sort((a, b) => a - b);
  return (ms[(ms.length - 1) >> 1] + ms[ms.length >> 1]) / 2;
})();

// Stage is 12 x 12 units; one unit is one box in the grid scene.
const U = 12;
const COL_X = (p: number) => 0.55 + p * 2.25;
const STACK = 0.62;
const BASE = 10.4;
const STRIP_Y = (m: number) => Math.min(10.2, Math.max(1.2, 6 - Math.log2(m) * 1.55));
const MEDIAN_Y = 6;

type Box = [number, number, number, number];
// The RUANGKOTAK mark, in stage units: the L built from 32 tiles, and the square that pops out of its notch.
const MARK: Box[] = [
  ...Array.from({ length: 8 }, (_, i): Box => [1 + (i % 4) * 1.1, 4.2 + Math.floor(i / 4) * 1.2, 1.1, 1.2]),
  ...Array.from({ length: 24 }, (_, i): Box => [1 + (i % 6) * (6.8 / 6), 6.6 + Math.floor(i / 6) * 1.1, 6.8 / 6, 1.1]),
];
const NOTCH: Box = [8.6, 1, 2.4, 2.4];

type Pose = { x: number; y: number; r: number; w: number; h: number; o: number };
const rect = (rx: number, ry: number, w: number, h: number, o = 1, r = 0): Pose => ({ x: rx + w / 2 - 0.5, y: ry + h / 2 - 0.5, w, h, o, r });

function poses(i: number): Pose[] {
  const c = CELLS[i];
  const scatter = rect(c.sx, c.sy, c.ss, c.ss, 0.25 + c.ss * 0.7, c.sr);
  const grid = rect(1 + (i % 10) + 0.07, 1 + Math.floor(i / 10) + 0.07, 0.86, 0.86);
  const stack = rect(COL_X(c.p) + (c.k % 3) * STACK + 0.04, BASE - (Math.floor(c.k / 3) + 1) * STACK + 0.04, STACK - 0.08, STACK - 0.08);
  const sz = i === BEST ? 0.6 : 0.42;
  const strip = rect(COL_X(c.p) + 0.93 + c.jx * 1.25 - sz / 2, STRIP_Y(c.m) - sz / 2, sz, sz, c.p === WIN ? 1 : 0.55);
  const [mx, my, mw, mh] = i === BEST ? NOTCH : MARK[i % MARK.length];
  const mark = rect(mx - 0.01, my - 0.01, mw + 0.02, mh + 0.02);
  return [scatter, grid, stack, strip, mark];
}
const POSES = CELLS.map((_, i) => poses(i));

// Scene windows on the pinned scroll, 0..1. Each cell also gets its own stagger inside the window.
const MOVES: [number, number][] = [
  [0.07, 0.25],
  [0.4, 0.55],
  [0.6, 0.73],
  [0.82, 0.94],
];
const SCAN: [number, number] = [0.2, 0.36];
const STAGGER = 0.45;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const back = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const scanned = (p: number) => clamp((p - SCAN[0]) / (SCAN[1] - SCAN[0]));

function delayFor(i: number, move: number) {
  const c = CELLS[i];
  if (move === 0) return ((i % 10) + Math.floor(i / 10)) / 18;
  if (move === 1) return c.p / 5 + (c.k / 28) * 0.2;
  if (move === 2) return c.d;
  return i === BEST ? 1 : c.d * 0.8;
}

function tone(m: number) {
  if (m >= 1.6) return "var(--good)";
  if (m >= 1.15) return "color-mix(in oklab, var(--good) 45%, var(--bg))";
  if (m <= 0.55) return "var(--bad)";
  if (m <= 0.85) return "color-mix(in oklab, var(--bad) 40%, var(--bg))";
  return "color-mix(in oklab, var(--ink) 22%, var(--bg))";
}
const IDLE = "color-mix(in oklab, var(--ink) 16%, var(--bg))";

function frame(i: number, p: number) {
  const P = POSES[i];
  let a = P[0];
  let b = P[0];
  let t = 0;
  for (let s = MOVES.length - 1; s >= 0; s--) {
    const [lo, hi] = MOVES[s];
    if (p >= lo) {
      const local = clamp((p - lo) / (hi - lo));
      const raw = clamp((local - delayFor(i, s) * STAGGER) / (1 - STAGGER));
      a = P[s];
      b = P[s + 1];
      t = s === 3 && i === BEST ? back(raw) : inOut(raw);
      break;
    }
  }
  const x = mix(a.x, b.x, t);
  const y = mix(a.y, b.y, t);
  const transform = `translate(${(x * 100).toFixed(2)}%, ${(y * 100).toFixed(2)}%) rotate(${mix(a.r, b.r, t).toFixed(1)}deg) scale(${mix(a.w, b.w, t).toFixed(3)}, ${mix(a.h, b.h, t).toFixed(3)})`;
  const opacity = mix(a.o, b.o, t).toFixed(3);

  let color = Math.floor(i / 10) < scanned(p) * 10.5 ? tone(CELLS[i].m) : IDLE;
  if (p >= MOVES[3][0] + 0.03) color = i === BEST ? "var(--good)" : "var(--ink)";
  return { transform, opacity, color };
}

const CAPTIONS = [
  { n: "01", h: "Picture 100 videos.", b: "From the inside, a feed looks like noise. Some hit, most don't, and the app never says why." },
  { n: "02", h: "We read every one.", b: "Views, captions and dates, each measured against your usual. Green beat it. Red fell below." },
  { n: "03", h: "Sorted by content type.", b: "Reviews are what this account posts most. Twenty-eight of a hundred." },
  {
    n: "04",
    h: "Then weighed.",
    b: `How-to videos are only ${COUNTS[WIN]} of 100, yet they pull ${WIN_MEDIAN.toFixed(1)}x the usual views. The best type is the rarest.`,
  },
  { n: "05", h: "Fix one thing first.", b: "Post more of what already works. That one change is where every diagnosis starts." },
];
const WINDOWS: [number, number][] = [
  [-1, 0.14],
  [0.14, 0.38],
  [0.38, 0.58],
  [0.58, 0.8],
  [0.8, 2],
];

function Caption({ i, p }: { i: number; p: MotionValue<number> }) {
  const [lo, hi] = WINDOWS[i];
  // Out before in: the old caption clears the slot before the next one rises into it.
  const f = 0.025;
  const opacity = useTransform(p, [lo, lo + f, hi - f, hi], [0, 1, 1, 0]);
  const y = useTransform(p, [lo, lo + f, hi - f, hi], [24, 0, 0, -24]);
  const c = CAPTIONS[i];
  return (
    <motion.div style={{ opacity, y }} className="col-start-1 row-start-1" aria-hidden>
      <h3 className="text-4xl md:text-6xl">{c.h}</h3>
      <p className="mt-4 max-w-[38ch] text-muted">{c.b}</p>
    </motion.div>
  );
}

function Ruler({ p }: { p: MotionValue<number> }) {
  return (
    <div aria-hidden className="relative hidden h-40 w-px shrink-0 bg-line md:block">
      <motion.div style={{ scaleY: p }} className="absolute inset-0 origin-top bg-good" />
    </div>
  );
}

function Counter({ p }: { p: MotionValue<number> }) {
  const n = useTransform(p, (v) => CAPTIONS[Math.max(0, WINDOWS.findIndex(([lo, hi]) => v >= lo && v < hi))].n);
  const read = useTransform(p, (v) => `${Math.round(scanned(v) * 100)}`.padStart(3, "0"));
  return (
    <div aria-hidden className="flex items-baseline gap-6 font-mono text-xs text-muted">
      <span>
        <motion.span className="num text-ink">{n}</motion.span> / 05
      </span>
      <span>
        videos read <motion.span className="num text-ink">{read}</motion.span>
      </span>
    </div>
  );
}

const u = (n: number) => `${(n / U) * 100}%`;

function Stage({ p, still }: { p: MotionValue<number>; still?: number }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const last = useRef<string[]>([]);

  function paint(v: number) {
    for (let i = 0; i < CELLS.length; i++) {
      const el = refs.current[i];
      if (!el) continue;
      const f = frame(i, v);
      el.style.transform = f.transform;
      el.style.opacity = f.opacity;
      if (last.current[i] !== f.color) el.style.backgroundColor = last.current[i] = f.color;
    }
  }
  useMotionValueEvent(p, "change", (v) => {
    if (still === undefined) paint(v);
  });
  useEffect(() => paint(still ?? p.get()));

  const scanTop = useTransform(p, (v) => u(1 + scanned(v) * 10));
  const scanO = useTransform(p, [SCAN[0] - 0.01, SCAN[0] + 0.01, SCAN[1] - 0.01, SCAN[1] + 0.01], [0, 1, 1, 0]);
  const labelO = useTransform(p, [0.47, 0.53, 0.78, 0.82], [0, 1, 1, 0]);
  const medianX = useTransform(p, [0.66, 0.74], [0, 1]);
  const medianO = useTransform(p, [0.64, 0.66, 0.8, 0.83], [0, 1, 1, 0]);
  const bandO = useTransform(p, [0.72, 0.76, 0.8, 0.83], [0, 1, 1, 0]);
  const bestO = useTransform(p, [0.93, 0.98], [0, 1]);
  const at = (mv: MotionValue<number>, v: number) => (still === undefined ? mv : v);
  const first = still ?? 0;

  return (
    <div
      className="relative aspect-square w-full"
      role="img"
      aria-label="A hundred boxes, one per video, sorted into five content types and weighed against the usual views. How-to videos come out on top."
    >
      <motion.div
        aria-hidden
        className="absolute bg-good-soft"
        style={{ left: u(COL_X(WIN) - 0.12), width: u(STACK * 3 + 0.24), top: u(1), bottom: u(U - BASE - 0.1), opacity: at(bandO, 1) }}
      />
      <motion.div
        aria-hidden
        className="absolute left-[4%] right-[4%] origin-left border-t-[1.5px] border-dashed border-ink"
        style={{ top: u(MEDIAN_Y), scaleX: at(medianX, 1), opacity: at(medianO, 1) }}
      >
        <span className="absolute left-1 top-1.5 font-mono text-[10px] text-muted md:text-xs">your usual</span>
      </motion.div>
      <motion.div
        aria-hidden
        className="absolute left-[6%] right-[6%] h-[2px] bg-good"
        style={{ top: scanTop, opacity: at(scanO, 0) }}
      />
      {CELLS.map((_, i) => {
        const f = frame(i, first);
        return (
          <div
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-hidden
            className="absolute left-0 top-0 transition-[background-color] duration-500 will-change-transform"
            style={{ width: u(1), height: u(1), backgroundColor: f.color, transform: f.transform, opacity: f.opacity }}
          />
        );
      })}
      <motion.div aria-hidden style={{ opacity: at(labelO, 1) }} className="absolute inset-0">
        {PILLARS.map((name, k) => (
          <span
            key={name}
            className={`absolute text-center font-mono text-[9px] leading-tight md:text-xs ${k === WIN ? "font-semibold text-good" : "text-muted"}`}
            style={{ left: u(COL_X(k) - 0.1), width: u(STACK * 3 + 0.2), top: `calc(${u(BASE)} + 6px)` }}
          >
            {name}
          </span>
        ))}
      </motion.div>
      <motion.span
        aria-hidden
        style={{ opacity: at(bestO, 0), right: u(1), top: `calc(${u(3.4)} + 8px)` }}
        className="absolute whitespace-nowrap font-mono text-[10px] text-good md:text-xs"
      >
        your best video, pulled out
      </motion.span>
    </div>
  );
}

export function DiagnosisFilm() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.35, restDelta: 0.0005 });

  if (reduce) {
    return (
      <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 py-24 md:grid-cols-[0.9fr_1fr] md:px-8">
        <div>
          <p className="font-mono text-xs text-muted">The diagnosis, in five moves. Illustration, not a real account.</p>
          <ol className="mt-6 grid gap-6">
            {CAPTIONS.map((c) => (
              <li key={c.n}>
                <h3 className="text-xl font-semibold tracking-tight">{c.h}</h3>
                <p className="mt-1 max-w-[46ch] text-muted">{c.b}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="mx-auto w-full max-w-[520px]">
          <Stage p={p} still={0.77} />
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} aria-label="How a diagnosis reads an account" className="relative h-[520vh]">
      <div className="sticky top-0 flex h-[100dvh] items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-[1240px] items-center gap-4 px-4 pt-16 md:grid-cols-[0.85fr_1fr] md:gap-16 md:px-8 md:pt-0">
          <div className="flex gap-8">
            <Ruler p={p} />
            <div className="min-w-0 flex-1">
              <Counter p={p} />
              <div className="mt-4 grid min-h-[9.5rem] md:mt-8 md:min-h-[14rem]">
                {CAPTIONS.map((_, i) => (
                  <Caption key={i} i={i} p={p} />
                ))}
              </div>
              <p className="sr-only">{CAPTIONS.map((c) => `${c.h} ${c.b}`).join(" ")}</p>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[min(92vw,50dvh)] md:max-w-[min(100%,76dvh)]">
            <Stage p={p} />
            <p className="mt-2 text-right font-mono text-[10px] text-muted md:text-xs">Illustration, not a real account.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
