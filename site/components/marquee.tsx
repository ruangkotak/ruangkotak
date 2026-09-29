"use client";

import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from "motion/react";
import { useRef } from "react";

const wrap = (min: number, max: number, v: number) => {
  const r = max - min;
  return ((((v - min) % r) + r) % r) + min;
};

// One strip of niches: says "any niche" and answers your scroll speed and direction.
export function Marquee({ items, baseVelocity = -2 }: { items: string[]; baseVelocity?: number }) {
  const reduce = useReducedMotion();
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const factor = useTransform(velocity, [0, 1000], [0, 4], { clamp: false });
  const x = useTransform(baseX, (v) => `${wrap(-50, -25, v)}%`);
  const dir = useRef(1);

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    let move = dir.current * baseVelocity * (delta / 1000);
    const f = factor.get();
    if (f < 0) dir.current = -1;
    else if (f > 0) dir.current = 1;
    move += dir.current * move * f;
    baseX.set(baseX.get() + move);
  });

  return (
    <section className="overflow-hidden border-y border-line py-10 md:py-14">
      <h2 className="sr-only">Works for any niche: {items.join(", ")}</h2>
      <motion.div aria-hidden className="flex w-max whitespace-nowrap" style={{ x }}>
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="flex shrink-0 items-center">
            {items.map((t, i) => (
              <div key={t} className="flex items-center">
                <span
                  className={`px-6 text-5xl font-semibold tracking-tighter md:px-10 md:text-7xl ${i % 2 ? "text-transparent" : ""}`}
                  style={i % 2 ? { WebkitTextStroke: "1.5px var(--ink)" } : undefined}
                >
                  {t}
                </span>
                <span className="size-3 shrink-0 bg-good md:size-4" />
              </div>
            ))}
          </div>
        ))}
      </motion.div>
    </section>
  );
}
