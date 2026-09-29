"use client";

import { motion } from "motion/react";
import { introDelay } from "./intro";

const WORDS = ["See", "why", "some", "videos", "pop", "and", "the", "rest", "sink."];

// The headline acts out its own words: "pop" springs up, "sink" slowly drops. Hover either to do it again.
export function HeroTitle() {
  const d = introDelay();
  return (
    <h1
      aria-label="See why some videos pop and the rest sink."
      className="max-w-[15ch] text-4xl font-semibold leading-[1.08] tracking-tighter md:text-5xl lg:text-6xl"
    >
      {WORDS.map((w, i) => {
        const pop = w === "pop";
        const sink = w === "sink.";
        return (
          <span key={i} aria-hidden>
            <motion.span
              className="inline-block"
              initial={{ opacity: 0, y: "0.5em", filter: "blur(8px)" }}
              animate={{ opacity: 1, y: "0em", filter: "blur(0px)" }}
              transition={{ delay: d + 0.1 + i * 0.07, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              {pop || sink ? (
                <motion.span
                  className={`inline-block cursor-default ${pop ? "text-good" : "text-bad"}`}
                  initial={{ y: "0em", rotate: 0 }}
                  animate={pop ? { y: "-0.12em" } : { y: "0.12em", rotate: 4 }}
                  whileHover={pop ? { y: "-0.34em", scale: 1.08 } : { y: "0.3em", rotate: 9 }}
                  transition={
                    pop
                      ? { delay: d + 1.3, type: "spring", stiffness: 520, damping: 8 }
                      : { delay: d + 1.6, type: "spring", stiffness: 55, damping: 11 }
                  }
                >
                  {w}
                </motion.span>
              ) : (
                w
              )}
            </motion.span>
            {i < WORDS.length - 1 ? " " : ""}
          </span>
        );
      })}
    </h1>
  );
}
