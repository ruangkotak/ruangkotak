"use client";

import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";

const TEXT = "Some of your videos take off. Most of them don't. Your insights show the numbers, never the reason.";

function Word({ word, i, n, progress }: { word: string; i: number; n: number; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [i / n, (i + 1) / n], [0.14, 1]);
  return <motion.span style={{ opacity }}>{word} </motion.span>;
}

// The sentence lights up word by word as you scroll: the reader "lives" the problem at reading pace.
export function Problem() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const words = TEXT.split(" ");
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-28 md:px-8 md:py-44">
      <p className="eyebrow mb-8">The problem</p>
      <p ref={ref} className="display max-w-[22ch] text-4xl md:text-6xl lg:text-[80px]">
        {words.map((w, i) => (
          <Word key={i} word={w} i={i} n={words.length} progress={scrollYProgress} />
        ))}
      </p>
      <p className="mt-10 max-w-[48ch] text-base text-muted md:ml-[30%]">
        RUANGKOTAK reads your account the way an editor would: by content type, by format, by hook. Then it tells you what to
        change first.
      </p>
    </section>
  );
}
