"use client";

import { MotionConfig } from "motion/react";

// reducedMotion="user": every Motion transform collapses to instant when the OS asks for less motion.
export function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
