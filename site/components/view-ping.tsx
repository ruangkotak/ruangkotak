"use client";

import { useEffect } from "react";

// Tells /api/view the homepage was opened in a real browser. Crawlers that don't run JavaScript and
// link prefetches never get here. Stores nothing on the device; a failed ping is ignored.
export function ViewPing() {
  useEffect(() => {
    try {
      if (!navigator.sendBeacon?.("/api/view")) void fetch("/api/view", { method: "POST", keepalive: true }).catch(() => {});
    } catch {}
  }, []);
  return null;
}
