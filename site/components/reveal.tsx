"use client";

import { motion } from "motion/react";

const TAGS = { h2: motion.h2, h3: motion.h3, p: motion.p };

// Headings rise word by word from behind a mask as they enter view.
export function Reveal({ text, as = "h2", className = "" }: { text: string; as?: keyof typeof TAGS; className?: string }) {
  const Tag = TAGS[as] as typeof motion.h2;
  const words = text.split(" ");
  return (
    <Tag className={className} aria-label={text} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.6 }} transition={{ staggerChildren: 0.06 }}>
      {words.map((w, i) => (
        <span key={i} aria-hidden>
          <span className="inline-block overflow-hidden pb-[0.1em] -mb-[0.1em] align-bottom">
            <motion.span
              className="inline-block"
              variants={{ hidden: { y: "110%" }, show: { y: "0%", transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] } } }}
            >
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
