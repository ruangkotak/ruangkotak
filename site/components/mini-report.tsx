import { fmt, fmtX } from "@/lib/analyze";
import type { Report } from "@/lib/types";
import { Cover } from "./redacted";

// The mini-diagnosis, same layout and maths as the standalone HTML report. Server component.
export const FULL_REPORT_ITEMS = [
  "Hook teardown of your best and weakest videos",
  "Profile and bio audit",
  "Your best days and times to post",
  "3 similar Malaysian accounts compared",
  "Restructured content pillars and named series",
];

export function MiniReport({ report: r, compact = false }: { report: Report; compact?: boolean }) {
  const H = compact ? "h3" : "h1";
  const S = compact ? "h4" : "h2";
  const max = Math.max(...r.pillars.map((p) => p.multiple), 1.5);
  const toneOf = (i: number) =>
    r.top.includes(i) ? "t-top text-on-solid" : r.bottom.includes(i) ? "t-bot text-on-solid" : r.multiples[i] >= 1.25 ? "t-up text-good" : r.multiples[i] <= 0.75 ? "t-down text-bad" : "text-muted";

  const clip = (i: number, good: boolean) => {
    const v = r.videos[i];
    return (
      <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-3">
        <Cover src={v.cover} good={good} className="w-10" />
        <div>
          <p className="line-clamp-2 text-sm font-semibold leading-snug">
            {v.url ? (
              <a href={v.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:decoration-ink">
                {v.title}
              </a>
            ) : (
              v.title
            )}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">
            <span className="num">{fmt(v.views)}</span> views, <b className={`num ${good ? "text-good" : "text-bad"}`}>{fmtX(r.multiples[i])}</b>
          </p>
          {v.why && <p className="mt-1 text-[13px]">{v.why}</p>}
        </div>
      </li>
    );
  };

  return (
    <article className="text-[14.5px]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 pb-3 text-[13px] text-muted">
        <span className="font-semibold text-ink">Mini-diagnosis</span>
        <span>
          {r.handle} on {r.platform}
          , <span className="num">{fmt(r.followers)}</span> followers, {r.date}
        </span>
      </header>

      <section className="grid gap-8 border-t-2 border-ink py-6 md:grid-cols-[1.2fr_1fr]">
        <div>
          <H className="text-2xl font-bold leading-tight tracking-tight md:text-[30px]">{r.verdict}</H>
          <dl className="mt-5 flex flex-wrap gap-y-3">
            {[
              ["Latest videos", String(r.videos.length)],
              ["Usual views", fmt(r.median)],
              ["Best video", fmtX(r.multiples[r.top[0]])],
            ].map(([k, v], i) => (
              <div key={k} className={`pr-5 ${i ? "border-l border-line pl-5" : ""}`}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="num text-xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <figure>
          <div className="grid grid-cols-5 gap-1">
            {r.videos.map((_, i) => (
              <div key={i} className={`kotak-cell grid aspect-square place-items-center text-xs font-semibold num ${toneOf(i)}`}>
                {fmtX(r.multiples[i])}
              </div>
            ))}
          </div>
          <figcaption className="mt-2 text-xs text-muted">
            One box, one video, newest at top left. Each number is views as a multiple of your usual. Solid boxes: the {r.top.length} best and {r.bottom.length} weakest.
          </figcaption>
        </figure>
      </section>

      <section className="border-t border-line py-6">
        <S className="mb-3 text-[15px] font-bold">By content type</S>
        <div className="grid gap-2">
          {r.pillars.map((p) => (
            <div key={p.name} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-3">
              <span className="truncate text-[13.5px] font-semibold">
                {p.name} <small className="font-normal text-muted">({p.count})</small>
              </span>
              <div className="relative h-3">
                <div className={`absolute inset-y-0 left-0 ${p.multiple >= 1 ? "bg-good" : "bg-bad"}`} style={{ width: `${(p.multiple / max) * 100}%` }} />
                <div className="absolute -inset-y-1.5 border-l-[1.5px] border-dashed border-ink" style={{ left: `${(1 / max) * 100}%` }} />
              </div>
              <span className={`num text-right text-[13.5px] ${p.multiple >= 1 ? "text-good" : "text-bad"}`}>{fmtX(p.multiple)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">The dashed line is your usual views. A bar past the line means that type beats your usual.</p>
      </section>

      <section className="grid gap-8 border-t border-line py-6 md:grid-cols-2">
        <div>
          <S className="mb-3 text-[15px] font-bold text-good">What worked</S>
          <ul className="grid gap-3">{r.top.map((i) => clip(i, true))}</ul>
        </div>
        <div>
          <S className="mb-3 text-[15px] font-bold text-bad">What sank</S>
          <ul className="grid gap-3">{r.bottom.map((i) => clip(i, false))}</ul>
        </div>
      </section>

      <section className="grid gap-8 border-t border-line py-6 md:grid-cols-2">
        <div>
          <S className="mb-3 text-[15px] font-bold">What the pattern says</S>
          <ol className="grid list-decimal gap-3 pl-5 marker:text-muted">
            {r.findings.map((f) => (
              <li key={f.h}>
                <p className="font-semibold leading-snug">{f.h}</p>
                <p className="mt-0.5 text-[13.5px] text-muted">{f.b}</p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <S className="mb-3 text-[15px] font-bold">Fix this first</S>
          <p className="border-l-4 border-good py-2 pl-3 text-[17px] font-bold leading-snug">{r.fixFirst}</p>
          <ul className="mt-3 grid list-disc gap-1 pl-5 text-[13.5px] text-muted">
            {r.fixThen.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-4 border-[1.5px] border-ink p-3 text-[13.5px]">
            <strong className="block text-xs text-muted">30-day target</strong>
            {r.target.replace("{median}", fmt(r.median))}
          </p>
        </div>
      </section>

      <section className="grid items-end gap-6 border-t-2 border-ink pt-6 md:grid-cols-[1.3fr_1fr]">
        <div>
          <S className="mb-2 text-[15px] font-bold">In the full report</S>
          <ul className="grid list-disc gap-1 pl-5 text-[13.5px] text-muted">
            {FULL_REPORT_ITEMS.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-[13px] text-muted">The full report is month one of monthly.</p>
          <a href="/#monthly" className="btn-primary">
            Apply for monthly
          </a>
        </div>
      </section>
    </article>
  );
}
