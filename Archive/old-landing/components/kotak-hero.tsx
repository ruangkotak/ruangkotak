"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { introDelay } from "./intro";

// Illustration only: a plausible spread of 100 videos as multiples of an account's median views.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(11);
const CELLS = Array.from({ length: 100 }, () => Math.exp((r() + r() + r() - 1.5) * 1.5));
const RANKED = [...CELLS.keys()].sort((a, b) => CELLS[b] - CELLS[a]);
const TOP = new Set(RANKED.slice(0, 3));
const BOT = new Set(RANKED.slice(-3));
const BEST = RANKED[0];
const tone = (i: number) =>
  TOP.has(i) ? "t-top" : BOT.has(i) ? "t-bot" : CELLS[i] >= 1.4 ? "t-up" : CELLS[i] <= 0.6 ? "t-down" : "t-flat";

const PHASES = { laid: 1, sorted: 2, popped: 3 } as const;

export function KotakHero() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) return setPhase(PHASES.popped);
    const wait = introDelay() * 1000;
    const l = setTimeout(() => setPhase(PHASES.laid), wait);
    const a = setTimeout(() => setPhase(PHASES.sorted), wait + 1900);
    const b = setTimeout(() => setPhase(PHASES.popped), wait + 3300);
    return () => (clearTimeout(l), clearTimeout(a), clearTimeout(b));
  }, [inView, reduce]);

  const row = Math.floor(BEST / 10);
  const col = BEST % 10;

  return (
    <figure ref={ref} className="relative w-full max-w-[520px] justify-self-center md:justify-self-end">
      <div className="pt-[13%] pr-[13%]">
        <div className="relative grid grid-cols-10 gap-[3px]">
          {CELLS.map((_, i) => (
            <motion.div
              key={i}
              className={`kotak-cell aspect-square ${phase >= PHASES.sorted ? tone(i) : ""} ${
                i === BEST && phase >= PHASES.popped ? "!bg-transparent !border-dashed !border-line" : ""
              }`}
              style={{ transitionDelay: `${((i % 10) + Math.floor(i / 10)) * 22}ms` }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={phase >= PHASES.laid ? { opacity: 1, scale: 1 } : undefined}
              transition={{ delay: i * 0.011, type: "spring", stiffness: 320, damping: 24 }}
            />
          ))}

          {phase >= PHASES.popped && (
            <motion.div
              aria-hidden
              className="absolute bg-good"
              style={{ width: "calc(10% - 2.7px)", aspectRatio: "1", left: `${col * 10}%`, top: `${row * 10}%` }}
              initial={{ x: 0, y: 0 }}
              animate={{ x: `${(9 - col) * 104 + 125}%`, y: `${-row * 104 - 125}%` }}
              transition={{ type: "spring", stiffness: 150, damping: 17 }}
            />
          )}
        </div>
      </div>
      <motion.p
        className="absolute right-[16%] top-0 text-right text-sm font-medium"
        initial={{ opacity: 0 }}
        animate={phase >= PHASES.popped ? { opacity: 1 } : undefined}
        transition={{ delay: 0.35 }}
      >
        Best video: <span className="num text-good">{CELLS[BEST].toFixed(1)}x</span> your usual views
      </motion.p>
      <figcaption className="mt-4 max-w-[46ch] text-sm text-muted">
        One box per video. Green beat your usual views, red fell below. Illustration, not a real account.
      </figcaption>
    </figure>
  );
}
