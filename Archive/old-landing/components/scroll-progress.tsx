"use client";

import { motion, useScroll, useSpring } from "motion/react";

// Reading progress: tells the visitor how far through the story they are.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });
  return <motion.div aria-hidden style={{ scaleX }} className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-mark" />;
}
