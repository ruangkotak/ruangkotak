"use client";

import { motion } from "motion/react";
import { focusPreview } from "./focus-preview";

const RUNGS = [
  {
    name: "Your handle",
    price: "Free, no login",
    body: "Type your TikTok or Instagram handle. We only read public videos, so no password is needed.",
    h: "md:h-[300px]",
  },
  {
    name: "Mini-diagnosis",
    price: "Free with your name and email",
    body: "Your latest 15 videos: every content type ranked, what worked, what sank, and the one fix to start with. On screen right away, with a copy in your email.",
    h: "md:h-[380px]",
  },
  {
    name: "Monthly",
    price: "Quoted after you apply",
    body: "Starts with the full report. Then we re-check your account every month and adjust the plan with you.",
    h: "md:h-[470px]",
  },
];

// Three steps that literally climb: each one is taller than the last, as it asks more and gives more.
export function Ladder() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-24 md:px-8 md:py-32">
      <p className="eyebrow">Three steps</p>
      <h2 className="mt-5 max-w-[16ch] text-4xl md:text-6xl lg:text-7xl">Start free. Go further when it makes sense.</h2>
      <div className="mt-14 grid items-end gap-3 md:grid-cols-[1fr_1.15fr_1.35fr]">
        {RUNGS.map((r, i) => {
          const last = i === RUNGS.length - 1;
          return (
            <motion.div
              key={r.name}
              className={`flex origin-bottom flex-col justify-between rounded-lg p-6 md:p-8 ${r.h} ${last ? "border-t-4 border-mark bg-carbon text-on-solid" : i === 1 ? "bg-tag" : "border border-line bg-surface"}`}
              initial={{ opacity: 0, scaleY: 0.4 }}
              whileInView={{ opacity: 1, scaleY: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: i * 0.15, type: "spring", stiffness: 120, damping: 18 }}
            >
              <div>
                <p className={`text-sm ${last ? "opacity-70" : "text-muted"}`}>{r.price}</p>
                <h3 className="mt-2 text-3xl md:text-4xl">{r.name}</h3>
              </div>
              <div className="mt-10">
                <p className={last ? "opacity-80" : "text-muted"}>{r.body}</p>
                {i === 0 && (
                  <a href="/#top" onClick={focusPreview} className="btn-primary mt-6">
                    Check my account
                  </a>
                )}
                {last && (
                  <a href="#monthly" className="mt-6 inline-flex min-h-12 items-center rounded-sm bg-bg px-5 text-ink transition-transform hover:-translate-y-px active:scale-[0.98]">
                    Apply for monthly
                  </a>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
