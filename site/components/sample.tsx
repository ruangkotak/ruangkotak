"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

// The report tilts up into place as it scrolls in, like a page being laid on the desk.
export function Sample({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.3"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [14, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [60, 0]);

  return (
    <section id="sample" className="mx-auto max-w-[1240px] px-4 py-24 md:px-8 md:py-32">
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">A real mini-diagnosis</h2>
          <p className="mt-4 max-w-[52ch] text-lg text-muted">
            This is what you unlock after the preview. In your own report, every number can be checked against your public view counts.
          </p>
        </div>
        <a href="/r/sample" className="btn-ghost w-fit">
          Open the full sample <ArrowUpRight size={18} weight="bold" />
        </a>
      </div>
      <p className="mt-6 text-sm text-muted">
        From a real creator account. Username hidden.
      </p>
      <div className="mt-10 [perspective:1600px]" ref={ref}>
        <motion.div
          style={{ rotateX, scale, y, transformOrigin: "50% 0%" }}
          className="relative max-h-[760px] overflow-hidden border border-line bg-surface p-5 shadow-[0_40px_80px_-40px_color-mix(in_oklab,var(--ink)_35%,transparent)] md:p-10"
        >
          {children}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-surface to-transparent" />
        </motion.div>
      </div>
    </section>
  );
}
