"use client";

import { Check, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Report } from "@/lib/types";
import { Cover } from "./redacted";

// Month one of monthly. Every visual here is an example layout, not a real account's numbers.

function Diagnosis({ r }: { r: Report }) {
  const rows = [
    ["Opens with", "A character talking to you", "The venue entrance"],
    ["On-screen text", "The story line", "None"],
    ["First cut", "Under 1 second", "After 3 seconds"],
  ];
  const covers = [r.videos[r.top[0]].cover, r.videos[r.bottom[0]].cover];
  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
      <div className="flex gap-3">
        {covers.map((c, i) => (
          <Cover key={i} src={c} good={!i} className={`w-20 outline outline-2 ${i ? "outline-bad" : "outline-good"}`} />
        ))}
      </div>
      <div className="grid content-start text-sm">
        <div className="grid grid-cols-[7rem_1fr_1fr] gap-3 pb-2 text-xs font-semibold">
          <span />
          <span className="text-good">Best video</span>
          <span className="text-bad">Weakest video</span>
        </div>
        {rows.map(([k, a, b], i) => (
          <motion.div
            key={k}
            className="grid grid-cols-[7rem_1fr_1fr] gap-3 border-t border-line py-2.5"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
          >
            <span className="text-muted">{k}</span>
            <span>{a}</span>
            <span>{b}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Profile() {
  const items: [string, boolean][] = [
    ["Bio says who the account is for", false],
    ["Link goes somewhere useful", true],
    ["Pinned videos show your best format", false],
    ["First 9 posts look like one account", true],
  ];
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map(([t, ok], i) => (
        <motion.li
          key={t}
          className={`flex items-start gap-3 p-4 ${ok ? "bg-good-soft" : "bg-bad-soft"}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07 }}
        >
          <span className={ok ? "text-good" : "text-bad"}>{ok ? <Check size={20} weight="bold" /> : <X size={20} weight="bold" />}</span>
          <span className="font-medium">{t}</span>
        </motion.li>
      ))}
    </ul>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["Morning", "Afternoon", "Evening", "Night"];
const HEAT = [
  [0, 1, 2, 1], [0, 1, 2, 1], [0, 1, 3, 2], [0, 1, 2, 1], [1, 1, 3, 3], [1, 2, 2, 2], [1, 2, 3, 1],
];
const HEAT_CLASS = ["bg-line/50", "bg-good-soft", "bg-good/60", "bg-good"];

function Timing() {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[420px] grid-cols-[5rem_repeat(7,1fr)] gap-1 text-xs">
        <span />
        {DAYS.map((d) => (
          <span key={d} className="text-center text-muted">{d}</span>
        ))}
        {SLOTS.map((s, si) => (
          <div key={s} className="contents">
            <span className="self-center text-muted">{s}</span>
            {DAYS.map((d, di) => (
              <motion.span
                key={d}
                className={`h-9 ${HEAT_CLASS[HEAT[di][si]]}`}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (di + si) * 0.03 }}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Darker green: your videos posted in that slot beat your usual views more often.</p>
    </div>
  );
}

function Competitors() {
  const rows = [
    ["You", 1, "Stories"],
    ["Similar account 1", 5, "Gear reviews"],
    ["Similar account 2", 4, "Tips and tricks"],
    ["Similar account 3", 3, "Car gadgets"],
  ] as const;
  return (
    <div className="grid gap-3 text-sm">
      {rows.map(([name, perWeek, type], i) => (
        <div key={name} className="grid grid-cols-[9rem_1fr_7rem] items-center gap-3">
          <span className={i === 0 ? "font-semibold" : "text-muted"}>{name}</span>
          <div className="flex gap-1">
            {Array.from({ length: perWeek }, (_, k) => (
              <motion.span
                key={k}
                className={`size-5 ${i === 0 ? "bg-ink" : "bg-good"}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 + k * 0.05 }}
              />
            ))}
          </div>
          <span className="truncate text-muted">{type}</span>
        </div>
      ))}
      <p className="text-xs text-muted">Each square is one post per week. Right column: their strongest content type.</p>
    </div>
  );
}

function Strategy() {
  const pillars = [
    { p: "Stories", s: "Kisah Ahmad", c: "Weekly" },
    { p: "Creator gear", s: "I test it so you don't waste your money", c: "Weekly" },
    { p: "Car accessories", s: "Must-have for your car", c: "Every 2 weeks" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
      {pillars.map((x, i) => (
        <motion.div
          key={x.p}
          className={`p-5 ${i === 0 ? "bg-ink text-bg" : "border border-line"}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <p className={`text-xs ${i === 0 ? "opacity-70" : "text-muted"}`}>Pillar</p>
          <p className="font-semibold">{x.p}</p>
          <p className={`mt-4 text-xs ${i === 0 ? "opacity-70" : "text-muted"}`}>Named series</p>
          <p className="text-lg font-semibold">&ldquo;{x.s}&rdquo;</p>
          <p className={`mt-1 text-sm ${i === 0 ? "opacity-80" : "text-muted"}`}>{x.c}</p>
        </motion.div>
      ))}
    </div>
  );
}

const TABS = [
  { k: "Diagnosis", b: "Everything in the mini, plus a hook teardown: the first 3 seconds of your best and weakest videos." },
  { k: "Profile", b: "What a new visitor sees in the first 5 seconds on your profile: bio, link, pinned videos, grid." },
  { k: "Timing", b: "Your best days and hours to post, from your own history, and what posting gaps have cost you." },
  { k: "Competitors", b: "Three similar Malaysian accounts in your niche, compared on content type, format and posting rhythm." },
  { k: "Strategy", b: "Your content restructured into clear pillars and named series you can repeat every week." },
] as const;

export function FullReport({ report }: { report: Report }) {
  const [tab, setTab] = useState(0);
  const panels = [<Diagnosis key={0} r={report} />, <Profile key={1} />, <Timing key={2} />, <Competitors key={3} />, <Strategy key={4} />];

  return (
    <section id="full" className="border-y border-line bg-surface">
      <div className="mx-auto max-w-[1240px] px-4 py-24 md:px-8 md:py-32">
        <h2 className="max-w-[20ch] text-3xl font-semibold tracking-tight md:text-5xl">The full report, month one of monthly</h2>
        <p className="mt-4 max-w-[56ch] text-lg text-muted">
          A private page with five tabs. Each month we re-check your account and update the same page, so you can see what changed.
        </p>

        <div role="tablist" aria-label="Full report sections" className="mt-12 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]">
          {TABS.map((t, i) => (
            <button
              key={t.k}
              role="tab"
              id={`tab-${i}`}
              aria-selected={tab === i}
              aria-controls="full-panel"
              onClick={() => setTab(i)}
              className={`relative shrink-0 px-4 py-3 text-sm font-semibold transition-colors ${tab === i ? "text-ink" : "text-muted hover:text-ink"}`}
            >
              {t.k}
              {tab === i && <motion.span layoutId="tab-line" className="absolute inset-x-0 bottom-0 h-[3px] bg-good" />}
            </button>
          ))}
        </div>

        <div id="full-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-[360px] pt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              className="grid gap-8 md:grid-cols-[1fr_1.6fr] md:gap-14"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div>
                <h3 className="text-2xl font-semibold tracking-tight">{TABS[tab].k}</h3>
                <p className="mt-3 text-muted">{TABS[tab].b}</p>
                <p className="mt-6 text-xs text-muted">Example layout. Your report uses your own account.</p>
              </div>
              {panels[tab]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
