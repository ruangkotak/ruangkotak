"use client";

import { ArrowUpRight, Check, CheckCircle, Copy, HourglassMedium } from "@phosphor-icons/react";
import { useState } from "react";
import { clientUpdate, type AccountPanel as Panel } from "@/lib/station";
import { dur } from "./parts";

const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[6px] border border-line bg-[var(--raised)] px-3 py-2.5">
      <span className="label">{label}</span>
      <span className="num text-[24px] leading-none">{value}</span>
      {note && <span className="text-[11px] text-muted">{note}</span>}
    </div>
  );
}

/** Median plays per check, as a small line. Needs two checks to draw. */
function Trend({ points }: { points: Panel["trend"] }) {
  if (points.length < 2) return <p className="text-[11px] text-muted">The trend line appears after the second check.</p>;
  const max = Math.max(...points.map((p) => p.median), 1);
  const w = 300, h = 48;
  const xy = points.map((p, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 4 - (p.median / max) * (h - 8)).toFixed(1)}`);
  const last = points.at(-1)!, first = points[0];
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label={`Median plays per reel went from ${compact(first.median)} on ${day(first.at)} to ${compact(last.median)} on ${day(last.at)}`}>
        <polyline points={xy.join(" ")} fill="none" stroke="var(--mark)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption className="flex justify-between text-[11px] text-muted">
        <span>{day(first.at)} · {compact(first.median)}</span>
        <span>median plays per reel</span>
        <span>{day(last.at)} · {compact(last.median)}</span>
      </figcaption>
    </figure>
  );
}

/** Owner only: the week as plain text, to copy into a message. You send it yourself. */
function Update({ p, now }: { p: Panel; now: number }) {
  const [copied, setCopied] = useState(false);
  const text = clientUpdate(p, new Date(now));
  return (
    <div className="st-card px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label">KNOX Update to send</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {}
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-ink"
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? "Copied" : "Copy update"}
        </button>
      </div>
      <pre className="mono mt-2 rounded-[6px] border border-line bg-[var(--raised)] px-2.5 py-2 text-[11.5px] leading-[1.55] whitespace-pre-wrap break-words">{text}</pre>
      <p className="mt-2 text-[11px] text-muted">Only you see this box. It uses the same numbers as this page; add your own words before sending.</p>
    </div>
  );
}

/** The page for one personal or client account: the week, their reels, and what is in review or delivered. */
export function AccountPanel({ p, now, client }: { p: Panel; now: number; client: boolean }) {
  return (
    <section aria-labelledby="account-panel" className="flex flex-col gap-3">
      <h2 id="account-panel" className="sr-only">{p.label}</h2>
      <div className="st-card px-3.5 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label">KNOX This week</span>
          <span className="text-[11px] text-muted">{p.checkedAt ? `reels checked ${dur(now - Date.parse(p.checkedAt))} ago` : "reels not checked yet"}</span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Reels posted" value={String(p.week.posted)} note="last 7 days" />
          <Stat label="Plays gained" value={p.week.playsGained === null ? "–" : `+${compact(p.week.playsGained)}`} note={p.week.playsGained === null ? "after two checks" : "across tracked reels"} />
          <Stat label="Delivered" value={String(p.week.delivered)} note="passed final review" />
          <Stat label="In final review" value={p.week.inReview === null ? "–" : String(p.week.inReview)} note={p.week.inReview === null ? "no review list yet" : "waiting now"} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="st-card px-3.5 py-3">
          <span className="label">KNOX {client ? "Your reels" : `${p.label} · reels`}</span>
          {p.reels.length ? (
            <>
              <div className="mt-2.5"><Trend points={p.trend} /></div>
              <ul className="mt-3 divide-y divide-line">
                {p.reels.slice(0, 8).map((r) => (
                  <li key={r.url} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                    <span className="text-muted">{dur(now - Date.parse(r.at))} ago</span>
                    <span className="num ml-auto">{compact(r.views)} plays</span>
                    <span className={`num w-[72px] text-right text-[11.5px] ${r.perHour ? "text-good" : "text-muted"}`}>{r.perHour === null ? "–" : `+${compact(r.perHour)}/h`}</span>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[32px] items-center gap-1 text-[11.5px] text-muted hover:text-ink" aria-label={`Open the reel posted ${day(r.at)} on Instagram`}>
                      Open <ArrowUpRight size={12} aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-muted">{client ? "Your" : "Their"} reels show here after the first check, which runs every 6 hours.</p>
          )}
        </div>

        <div className="st-card px-3.5 py-3">
          <span className="label">KNOX In final review</span>
          {p.review.items.length ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {p.review.items.map((x, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px]">
                  <HourglassMedium size={15} className="mt-0.5 shrink-0 text-[var(--mark)]" aria-hidden />
                  <span>{x.label}<span className="block text-[11px] text-muted">waiting {dur(now - Date.parse(x.at))}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[12px] text-muted">Nothing waiting for final review.</p>}
          <span className="label mt-4 block">KNOX Delivered recently</span>
          {p.review.delivered.length ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {p.review.delivered.map((x, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px]">
                  <CheckCircle size={15} weight="fill" className="mt-0.5 shrink-0 text-good" aria-hidden />
                  <span>{x.label}<span className="block text-[11px] text-muted">{day(x.at)}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[12px] text-muted">Nothing delivered in the last 30 days{client ? " yet" : ""}.</p>}
        </div>
      </div>
      {!client && <Update p={p} now={now} />}
    </section>
  );
}
