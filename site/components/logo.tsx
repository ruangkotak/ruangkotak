"use client";

import { motion, useReducedMotion } from "motion/react";
import { introDelay } from "./intro";
import { WORDMARK_D } from "./logo-paths";

// The mark is a box with one square pushed out of its corner. On intro the square starts inside
// the notch and pops out, the same move the hero grid makes with the best video.
export function Logo({ className = "", intro = false }: { className?: string; intro?: boolean }) {
  const reduce = useReducedMotion();
  const play = intro && !reduce;
  return (
    <svg viewBox="0 -300 8378.41 1629.41" role="img" aria-label="RUANGKOTAK" className={className}>
      <g transform="scale(10.29)">
        <path fill="currentColor" d="M0 32H44V56H68V100H0Z" />
        <motion.rect
          fill="currentColor"
          x="76"
          y="0"
          width="24"
          height="24"
          initial={play ? { x: -32, y: 32 } : false}
          animate={{ x: 0, y: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.6 + (play ? introDelay() : 0) }}
        />
      </g>
      <g transform="translate(1276.41 1029.41)">
        <path fill="currentColor" d={WORDMARK_D} />
      </g>
    </svg>
  );
}
