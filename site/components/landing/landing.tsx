"use client";

import { useEffect, useRef } from "react";
import { ApplyForm } from "@/components/apply-form";
import { CaptionCheck } from "@/components/caption-check";
import { usePreviewSheet } from "@/components/preview-flow";
import { initLanding, type LandingHooks } from "./init";
import { FOOT, MAIN_A, MAIN_B, MAIN_M, TOP } from "./markup";
import "./landing.css";

const CHUNKS = [TOP, MAIN_A, MAIN_M, MAIN_B, FOOT];

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const hooks = useRef<LandingHooks>({ start: () => false });
  const { start, sheet } = usePreviewSheet({ onHandleRejected: (msg) => hooks.current.reject?.(msg) });
  hooks.current.start = start;

  useEffect(() => {
    const el = root.current!;
    const stop = initLanding(hooks.current);
    return () => {
      stop();
      // init.ts rebuilds parts of the markup; put it back so a re-run (Strict Mode) starts clean.
      el.querySelectorAll<HTMLElement>("[data-chunk]").forEach((c) => (c.innerHTML = CHUNKS[Number(c.dataset.chunk)]));
    };
  }, []);

  // display:contents keeps the design's own element tree for layout and pinning.
  const chunk = (i: number) => <div data-chunk={i} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: CHUNKS[i] }} />;
  return (
    <div ref={root}>
      <noscript>
        <style>{"#intro{display:none}"}</style>
      </noscript>
      {chunk(0)}
      <main id="top">
        {chunk(1)}
        <CaptionCheck />
        {chunk(2)}
        <ApplyForm />
        {chunk(3)}
      </main>
      {chunk(4)}
      {sheet}
    </div>
  );
}
