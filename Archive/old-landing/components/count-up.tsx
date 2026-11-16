"use client";

import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef } from "react";

// Numbers count up once they are seen. Driven by a motion value, so React doesn't re-render per frame.
export function CountUp({ to, decimals = 0, suffix = "", duration = 1.2, className = "", start = true }: {
  to: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
  className?: string;
  start?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) =>
    `${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`,
  );

  useEffect(() => {
    if (!inView || !start) return;
    if (reduce) return void mv.set(to);
    const c = animate(mv, to, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [inView, start, reduce, to, duration, mv]);

  return (
    <motion.span ref={ref} className={`num ${className}`}>
      {text}
    </motion.span>
  );
}
