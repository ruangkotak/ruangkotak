"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { WORDMARK_D } from "./logo-paths";

// html[data-intro] is set before paint by INTRO_SCRIPT; hero pieces read it to wait for the curtain.
export const INTRO_SECONDS = 2.1;
export const introDelay = () => (typeof document !== "undefined" && document.documentElement.dataset.intro === "on" ? INTRO_SECONDS : 0);

type Box = [number, number, number, number];
const TILES: Box[] = [
  ...Array.from({ length: 8 }, (_, i): Box => [(i % 4) * 11, 32 + Math.floor(i / 4) * 12, 11, 12]),
  ...Array.from({ length: 24 }, (_, i): Box => [(i % 6) * (68 / 6), 56 + Math.floor(i / 6) * 11, 68 / 6, 11]),
];
const ease = [0.16, 1, 0.3, 1] as const;

// The mark builds itself from the same boxes the site uses for videos, then the best one pops out.
export function Intro() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (document.documentElement.dataset.intro !== "on") return setDone(true);
    const t = setTimeout(() => setDone(true), (INTRO_SECONDS - 0.2) * 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="intro"
          aria-hidden
          onClick={() => setDone(true)}
          className="rk-intro fixed inset-0 z-[70] grid cursor-pointer place-items-center bg-bg"
          exit={{ clipPath: "inset(0% 0% 100% 0%)" }}
          initial={{ clipPath: "inset(0% 0% 0% 0%)" }}
          transition={{ duration: 0.85, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="flex flex-col items-center gap-7">
            <svg viewBox="-4 -4 108 108" className="size-24 overflow-visible md:size-28">
              {TILES.map(([x, y, w, h], i) => (
                <motion.rect
                  key={i}
                  x={x - 0.2}
                  y={y - 0.2}
                  width={w + 0.4}
                  height={h + 0.4}
                  fill="var(--ink)"
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  initial={{ scale: 0, opacity: 0, rotate: 45 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ delay: 0.05 + ((i * 7) % 32) * 0.018, duration: 0.5, ease }}
                />
              ))}
              <motion.rect
                x="76"
                y="0"
                width="24"
                height="24"
                fill="var(--good)"
                initial={{ x: -32, y: 32, scale: 0.4, opacity: 0 }}
                animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
                transition={{ delay: 0.78, type: "spring", stiffness: 260, damping: 13 }}
              />
            </svg>
            <motion.svg
              viewBox="0 -712 7102 724"
              className="h-5 w-auto md:h-6"
              initial={{ clipPath: "inset(0% 100% 0% 0%)" }}
              animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
              transition={{ delay: 1.0, duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
            >
              <path fill="var(--ink)" d={WORDMARK_D} />
            </motion.svg>
            <motion.div
              className="h-px w-40 origin-left bg-line"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.1, duration: INTRO_SECONDS - 0.4, ease: "linear" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
