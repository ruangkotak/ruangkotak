"use client";

import { InstagramLogo, Play } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Report } from "@/lib/types";
import { Cover, RedactedHandle } from "./redacted";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtX = (n: number) => `${n >= 10 ? Math.round(n) : n.toFixed(n >= 1 ? 1 : 2)}x`;

const STEPS = [
  { h: "Read every video", b: "We pull your recent public videos with their views, captions and dates. Nothing needs your password." },
  { h: "Sort by content type", b: "Each video gets a content type, so you can see which kinds of video your audience actually watches." },
  { h: "Compare best and weakest", b: "Your top and bottom videos side by side, in your own words, so the pattern is plain to see." },
  { h: "Fix one thing first", b: "One clear change to start with, and a 30-day target you can check yourself." },
];

const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

// The account as its owner sees it: the profile grid, each tile getting "read" in turn.
function ReadVisual({ r }: { r: Report }) {
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-sm border border-line text-muted">
          <InstagramLogo size={20} />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">
            <RedactedHandle />
          </p>
          <p className="text-xs text-muted">
            <span className="num">{fmt(r.followers)}</span> followers, {r.videos.length} recent videos
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1">
        {r.videos.map((v, i) => (
          <motion.div
            key={i}
            className="relative aspect-[3/4] overflow-hidden bg-line md:aspect-square"
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05, type: "spring", stiffness: 280, damping: 24 }}
          >
            {v.cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.cover} alt="" className="h-full w-full object-cover" />
            )}
            <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent" />
            <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-xs font-semibold text-white num">
              <Play size={10} weight="fill" /> {short(v.views)}
            </span>
            <motion.span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-good"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.5 + i * 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SortVisual({ r }: { r: Report }) {
  const max = Math.max(...r.pillars.map((p) => p.multiple), 1.5);
  return (
    <div className="grid gap-3">
      {r.pillars.map((p, i) => (
        <div key={p.name} className="grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] items-center gap-3 text-sm">
          <span className="truncate font-medium">{p.name}</span>
          <div className="relative h-3">
            <motion.div
              className={`absolute inset-y-0 left-0 origin-left ${p.multiple >= 1 ? "bg-good" : "bg-bad"}`}
              style={{ width: `${(p.multiple / max) * 100}%` }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            />
            <div className="absolute -inset-y-1.5 border-l-[1.5px] border-dashed border-ink" style={{ left: `${(1 / max) * 100}%` }} />
          </div>
          <span className={`num text-right ${p.multiple >= 1 ? "text-good" : "text-bad"}`}>{fmtX(p.multiple)}</span>
        </div>
      ))}
      <p className="text-xs text-muted">Dashed line: the account&apos;s usual views.</p>
    </div>
  );
}

function CompareVisual({ r }: { r: Report }) {
  const pair = [
    { i: r.top[0], good: true },
    { i: r.bottom[0], good: false },
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      {pair.map(({ i, good }, k) => {
        const v = r.videos[i];
        return (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.12 }}>
            <Cover src={v.cover} good={good} className="w-full" />
            <p className={`mt-2 num text-lg font-semibold ${good ? "text-good" : "text-bad"}`}>{fmtX(r.multiples[i])}</p>
            <p className="line-clamp-2 text-sm">{v.title}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

function FixVisual({ r }: { r: Report }) {
  return (
    <div>
      <motion.p
        className="border-l-4 border-good py-2 pl-4 text-xl font-semibold leading-snug tracking-tight"
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
      >
        {r.fixFirst}
      </motion.p>
      <motion.p className="mt-5 border border-ink p-3 text-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
        <span className="block text-xs font-semibold text-muted">30-day target</span>
        {r.target.replace("{median}", fmt(r.median))}
      </motion.p>
    </div>
  );
}

const VISUALS = [ReadVisual, SortVisual, CompareVisual, FixVisual];

export function Method({ report }: { report: Report }) {
  const [active, setActive] = useState(0);
  const Visual = VISUALS[active];
  return (
    <section id="how" className="mx-auto max-w-[1240px] px-4 py-24 md:px-8 md:py-32">
      <p className="eyebrow">Method</p>
      <h2 className="mt-5 max-w-[16ch] text-4xl md:text-6xl lg:text-7xl">How the diagnosis works</h2>
      <div className="mt-14 grid gap-12 md:grid-cols-[1fr_1.1fr] md:gap-20">
        <ol>
          {STEPS.map((s, i) => {
            const V = VISUALS[i];
            return (
              <motion.li
                key={s.h}
                className="flex min-h-0 flex-col justify-center py-8 md:min-h-[62vh]"
                onViewportEnter={() => setActive(i)}
                viewport={{ amount: 0.6 }}
              >
                <p className={`num text-sm transition-colors ${active === i ? "text-good" : "text-muted"}`}>{i + 1}/4</p>
                <h3 className={`mt-2 text-2xl font-semibold tracking-tight transition-opacity md:text-3xl ${active === i ? "" : "md:opacity-35"}`}>{s.h}</h3>
                <p className={`mt-3 max-w-[40ch] text-muted transition-opacity ${active === i ? "" : "md:opacity-35"}`}>{s.b}</p>
                <div className="mt-8 md:hidden">
                  <V r={report} />
                </div>
              </motion.li>
            );
          })}
        </ol>
        <div className="hidden md:block">
          <div className="sticky top-28 rounded-lg border border-line bg-surface p-8">
            <p className="mb-6 text-xs text-muted">From a real diagnosis. Username hidden.</p>
            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
                <Visual r={report} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
