"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { WORDMARK_D } from "./logo-paths";

// The animated logo (public/brand/logo-animated.svg) rebuilt inline so it takes the site's colours: the word packs
// itself into the box, the box moves to the centre and the best square pops out in green, then it all unpacks.
// Keyframes live in globals.css (.lm-*) and only run while the logo is on screen.
export function LogoMotion({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [play, setPlay] = useState(false);
  // Observe the unclipped wrapper: Chrome counts clip-path, so a fully clipped element never "enters" view.
  const shown = useInView(ref, { once: true, amount: 0.3 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPlay(e.isIntersecting), {
      threshold: 0.35,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 48, clipPath: "inset(-60% -10% 100% -10%)" }}
        animate={shown ? { opacity: 1, y: 0, clipPath: "inset(-60% -10% -60% -10%)" } : undefined}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <svg
          viewBox="0 -300 8378.41 1629.41"
          role="img"
          aria-label="RUANGKOTAK"
          className="lm block h-auto w-full overflow-visible"
          data-play={play ? "" : undefined}
        >
          <defs>
            <clipPath id="lm-lane">
              <rect x="700" y="-300" width="7679.41" height="1629.41" />
            </clipPath>
          </defs>
          <g className="lm-anim lm-mark">
            <g transform="scale(10.29)">
              <path fill="currentColor" d="M0 32H44V56H68V100H0Z" />
              <path className="lm-anim lm-filler" fill="currentColor" d="M43 32H68V57H43Z" />
              <rect
                className="lm-anim lm-ring"
                x="76"
                y="0"
                width="24"
                height="24"
                fill="none"
                stroke="var(--good)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <rect
                className="lm-anim lm-ring lm-ring-2"
                x="76"
                y="0"
                width="24"
                height="24"
                fill="none"
                stroke="var(--good)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <rect className="lm-anim lm-sq" fill="var(--good)" x="76" y="0" width="24" height="24" />
            </g>
          </g>
          <g clipPath="url(#lm-lane)">
            <g className="lm-anim lm-word">
              <g transform="translate(1276.41 1029.41)">
                <path fill="currentColor" d={WORDMARK_D} />
              </g>
            </g>
          </g>
        </svg>
      </motion.div>
    </div>
  );
}
