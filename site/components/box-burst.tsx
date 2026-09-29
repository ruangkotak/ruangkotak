"use client";

import { motion } from "motion/react";
import { useState } from "react";

const TONES = ["bg-good", "bg-good-soft", "bg-ink", "bg-good", "bg-bad-soft"];

// A burst of boxes on success: the brand's squares celebrating a finished action.
export function BoxBurst({ count = 26 }: { count?: number }) {
  const [parts] = useState(() =>
    Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = 80 + Math.random() * 130;
      return {
        x: Math.cos(a) * d,
        y: Math.sin(a) * d + 30,
        s: 6 + Math.random() * 10,
        r: Math.random() * 360,
        t: 1 + Math.random() * 0.6,
        c: TONES[i % TONES.length],
      };
    }),
  );
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className={`absolute block ${p.c}`}
          style={{ width: p.s, height: p.s, marginLeft: -p.s / 2, marginTop: -p.s / 2 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.r, scale: 1 }}
          transition={{ duration: p.t, ease: [0.2, 0.8, 0.3, 1] }}
        />
      ))}
    </div>
  );
}
