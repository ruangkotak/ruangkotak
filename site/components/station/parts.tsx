"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, Check, CircleDashed, CircleNotch, Clock, Lightning, MinusCircle, Warning, WarningOctagon,
} from "@phosphor-icons/react";
import type { DeptView, DeskState, GateView, JobView, NeedsMe, NeedsYou, Probe, Snapshot, StageView, StationEvent } from "@/lib/station";

// ---------- time ----------

export function dur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "<1m";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kuala_Lumpur" });
const until = (iso: string | null | undefined, now: number) => (iso ? Date.parse(iso) - now : null);

/** The short status words a job or desk shows: IN 12m, DUE NOW, RUN 3m, STUCK… */
export function jobTag(j: Pick<JobView, "state" | "nextAt" | "startedAt">, now: number): string {
  if (j.state === "running" && j.startedAt) return `RUN ${dur(now - Date.parse(j.startedAt))}`;
  if (j.state === "stuck") return "STUCK";
  if (j.state === "failing") return "FAILED";
  if (j.state === "never") return "NO RUNS YET";
  const left = until(j.nextAt, now);
  if (j.state === "due" || (left !== null && left <= 0)) return "DUE NOW";
  return left === null ? "—" : `IN ${dur(left)}`;
}

// ---------- small pieces ----------

const DESK_ICON: Record<DeskState, React.ReactNode> = {
  running: <CircleNotch size={12} weight="bold" className="st-spin text-mark" aria-hidden />,
  stuck: <WarningOctagon size={12} weight="fill" className="text-bad" aria-hidden />,
  failing: <Warning size={12} weight="fill" className="text-bad" aria-hidden />,
  due: <Lightning size={12} weight="fill" className="text-mark" aria-hidden />,
  scheduled: <Clock size={12} weight="bold" aria-hidden />,
  idle: <MinusCircle size={12} className="text-muted" aria-hidden />,
  "no-read": <CircleDashed size={12} className="text-muted" aria-hidden />,
};
const DESK_WORD: Record<DeskState, string> = {
  running: "running", stuck: "stuck", failing: "last run failed", due: "due now", scheduled: "scheduled", idle: "idle", "no-read": "no read path yet",
};

export function Pips({ runs }: { runs: JobView["runs"] }) {
  const shown = [...runs].slice(0, 10).reverse();
  return (
    <span className="flex items-end gap-[2px]" aria-label={`last ${runs.length} runs: ${runs.map((r) => (r.ok === null ? "running" : r.ok ? "ok" : `exit ${r.exitCode ?? 1}`)).join(", ") || "none"}`}>
      {shown.length ? shown.map((r, i) => <span key={i} className="st-pip" data-r={r.ok === null ? "run" : r.ok ? "ok" : "fail"} />) : <span className="text-[11px] text-muted">no runs</span>}
    </span>
  );
}

function Desk({ d, now }: { d: DeptView["desks"][number]; now: number }) {
  const tag = d.state === "running" && d.since ? `RUN ${dur(now - Date.parse(d.since))}`
    : d.state === "scheduled" && d.nextAt ? `IN ${dur(Math.max(0, Date.parse(d.nextAt) - now))}`
    : d.state === "due" ? "DUE" : d.state === "stuck" ? "STUCK" : null;
  return (
    <li className="st-tile st-desk flex min-h-[46px] flex-col justify-between gap-1 px-2 py-1.5" data-state={d.state} title={`${d.name}: ${DESK_WORD[d.state]}${d.agent ? ` · agent ${d.agent}` : ""}`}>
      <span className="flex items-center justify-between gap-1">
        {DESK_ICON[d.state]}
        {tag && <span className={`mono text-[9.5px] ${d.state === "stuck" ? "text-bad" : d.state === "running" || d.state === "due" ? "text-mark" : "text-muted"}`}>{tag}</span>}
      </span>
      <span className="text-[11.5px] leading-tight">{d.name}</span>
      <span className="sr-only">{DESK_WORD[d.state]}</span>
    </li>
  );
}

function JobLine({ j, now, showAccount }: { j: JobView; now: number; showAccount: boolean }) {
  const tag = jobTag(j, now);
  const loud = j.state === "stuck" || j.state === "failing";
  return (
    <li className="st-tile st-job min-w-0 px-2.5 py-2" data-state={j.state}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-muted">{j.deskName}</span>
        <span className={`mono shrink-0 text-[10px] ${loud ? "text-bad" : j.state === "running" || tag === "DUE NOW" ? "text-mark" : "text-muted"}`}>
          {loud && <WarningOctagon size={10} weight="fill" className="mr-1 inline align-[-1px]" aria-hidden />}
          {j.state === "scheduled" && <Clock size={10} weight="bold" className="mr-1 inline align-[-1px]" aria-hidden />}
          {tag}
        </span>
      </div>
      <div className="mono mt-0.5 truncate text-[12.5px]">{j.id}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {j.reason ? <span className={`min-w-0 truncate text-[11px] ${loud ? "text-bad" : "text-muted"}`}>{j.reason}</span>
          : j.lastMessage ? <span className="min-w-0 truncate text-[11px] text-muted" title={j.lastMessage}>{showAccount ? `${j.account} · ` : ""}{j.lastMessage}</span>
          : <span className="text-[11px] text-muted">{showAccount ? j.account : j.schedule}</span>}
        <Pips runs={j.runs} />
      </div>
    </li>
  );
}

// ---------- sections ----------

export function TopBar({ s, now, online }: { s: Snapshot; now: number; online: boolean }) {
  const feed = s.top.feedAt ? dur(now - Date.parse(s.top.feedAt)) : "—";
  const owner = !!s.needsMe;
  const stage = (id: string) => s.stages?.find((x) => x.id === id)?.waiting ?? null;
  return (
    <header className="st-card grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 px-3.5 py-3 sm:flex sm:justify-between">
      <div className="flex items-center gap-2">
        <h1 className="mr-1 text-[13px] uppercase" style={{ fontWeight: 600, letterSpacing: "0.1em" }}><span className="text-mark">KNOX</span> Mission Control</h1>
        <span className={`h-2 w-2 rounded-full ${online ? "st-pulse bg-good" : "bg-bad"}`} aria-hidden />
        <span className="text-[12px] tracking-[0.06em]">{online ? "ONLINE" : "OFFLINE"}</span>
        <span className="text-[11px] text-muted">{s.top.source ? `from ${s.top.source}` : s.view.mode === "client" ? "client view" : "no source yet"}</span>
      </div>
      {owner ? (
        // The owner's header is about the business; the laptop's health numbers are on the Mission tab (Stuck stays here: it is an alarm).
        <dl className="col-span-2 grid grid-cols-5 items-end gap-2 sm:flex sm:gap-5">
          <Stat label="Needs me" value={s.needsMe!.length} tone={s.needsMe!.length ? "mark" : undefined} />
          <Stat label="In work" value={stage("make") === null && stage("post") === null ? "–" : (stage("make") ?? 0) + (stage("post") ?? 0)} />
          <Stat label="Clients" value={s.money?.clients ?? 0} />
          <Stat label="Per month" value={`RM${(s.money?.monthly ?? 0).toLocaleString("en-MY")}`} />
          <Stat label="Stuck" value={s.top.stuck} tone={s.top.stuck ? "bad" : undefined} hatch={s.top.stuck > 0} />
        </dl>
      ) : (
        <dl className="col-span-2 grid grid-cols-5 items-end gap-2 sm:flex sm:gap-5">
          <Stat label="Working" value={s.top.working} tone={s.top.working ? "mark" : undefined} />
          <Stat label="Queue" value={s.top.queue} />
          <Stat label="Stuck" value={s.top.stuck} tone={s.top.stuck ? "bad" : undefined} hatch={s.top.stuck > 0} />
          <Stat label="Feed" value={feed} small />
          <Stat label="Mode" value={s.top.live ? "LIVE" : "IDLE"} small tone={s.top.live ? "mark" : undefined} />
        </dl>
      )}
    </header>
  );
}

/** The laptop's health numbers, for the owner: what used to fill the header. */
export function HealthStats({ s, now }: { s: Snapshot; now: number }) {
  const feed = s.top.feedAt ? dur(now - Date.parse(s.top.feedAt)) : "—";
  return (
    <dl className="st-card grid grid-cols-4 items-end gap-2 px-3.5 py-3 sm:flex sm:gap-8">
      <Stat label="Working" value={s.top.working} tone={s.top.working ? "mark" : undefined} />
      <Stat label="Queue" value={s.top.queue} />
      <Stat label="Feed" value={feed} small />
      <Stat label="Mode" value={s.top.live ? "LIVE" : "IDLE"} small tone={s.top.live ? "mark" : undefined} />
    </dl>
  );
}

function Stat({ label, value, tone, hatch, small }: { label: string; value: number | string; tone?: "mark" | "bad"; hatch?: boolean; small?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label">{label}</dt>
      <dd className={`num leading-none ${small ? "text-[15px]" : "text-[26px]"} ${tone === "mark" ? "text-mark" : tone === "bad" ? "text-bad" : ""}`}>
        <span className={hatch ? "st-hatch rounded-[3px] px-1" : ""}>{value}</span>
      </dd>
    </div>
  );
}

// Literal class names, so Tailwind sees them.
const GATE_COLS: Record<number, string> = { 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-3", 7: "lg:grid-cols-4", 8: "lg:grid-cols-4" };

export function Gates({ gates, now }: { gates: GateView[]; now: number }) {
  if (!gates.length) return null;
  return (
    <section aria-label="Approval gates" className="st-card px-3.5 py-3">
      <div className="label mb-2.5">KNOX Gates</div>
      <ul className={`grid gap-2 sm:grid-cols-2 ${GATE_COLS[gates.length] ?? "lg:grid-cols-3"}`}>
        {gates.map((g) => {
          const next = until(g.nextReviewAt, now);
          return (
            <li key={g.id} className={`st-tile st-gate px-3 py-2.5 ${g.overdue ? "st-desk" : ""}`} data-state={g.overdue ? "stuck" : undefined}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] tracking-[0.08em] uppercase">{g.label}</span>
                <span className={`num text-[20px] leading-none ${g.overdue ? "text-bad" : g.waiting ? "text-mark" : "text-muted"}`}>{g.waiting ?? "–"}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {g.waiting === null ? "no read path yet" : g.waiting === 0 ? "nothing in review" : `${g.waiting} waiting${g.oldestAt ? ` · oldest ${dur(now - Date.parse(g.oldestAt))}` : ""}`}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {g.reviewer} · {next === null ? "no review job" : next <= 0 ? "review due now" : `review in ${dur(next)}`}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const FUNNEL: [string, string][] = [["home_view", "Home"], ["preview_started", "Preview"], ["preview_completed", "Done"], ["report_viewed", "Report"], ["apply_submitted", "Apply"]];

function Funnel({ f }: { f: Snapshot["funnel"] }) {
  if (f.status !== "ok") return <div className="mt-3 text-[11px] text-muted">Funnel · {f.status === "error" ? "counters unavailable" : "no read path yet"}</div>;
  const week = Object.fromEntries(FUNNEL.map(([k]) => [k, f.days.reduce((s, d) => s + Number(d[k] ?? 0), 0)]));
  const today = f.days.at(-1);
  const top = Math.max(1, ...Object.values(week)); // scale to the biggest step: home views can be fewer (e.g. direct links)
  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <div className="label mb-1.5">KNOX Site funnel · 7 days</div>
      <ol className="grid grid-cols-5 gap-1.5">
        {FUNNEL.map(([k, name]) => (
          <li key={k} className="flex flex-col gap-1">
            <span className="h-1 rounded-full bg-line"><span className="block h-1 rounded-full bg-carbon" style={{ width: `${Math.min(100, Math.max(4, (week[k] / top) * 100))}%` }} /></span>
            <span className="num text-[15px] leading-none">{week[k]}</span>
            <span className="text-[10px] text-muted">{name} <span className="num">+{Number(today?.[k] ?? 0)}</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function DeptCard({ d, now, funnel, showAccount, className = "" }: { d: DeptView; now: number; funnel?: Snapshot["funnel"]; showAccount: boolean; className?: string }) {
  const wide = d.desks.length > 3;
  return (
    <section aria-labelledby={`dept-${d.id}`} className={`st-card @container min-w-0 px-3.5 py-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={`dept-${d.id}`} className="text-[13px] tracking-[0.06em] uppercase" style={{ fontWeight: 500, letterSpacing: "0.06em" }}>
          <span className="num mr-1.5 text-muted">{d.no}</span>KNOX {d.name}
        </h2>
        <span className="label">Jobs</span>
      </div>
      <div className={`mt-2.5 grid gap-3 ${wide ? "@[540px]:grid-cols-[1fr_1fr]" : ""}`}>
        <ul className={`grid content-start gap-1.5 ${wide ? "grid-cols-3 @[540px]:grid-cols-2" : "grid-cols-2"}`}>
          {d.desks.map((k) => <Desk key={k.id} d={k} now={now} />)}
        </ul>
        <div className="flex min-w-0 flex-col gap-1.5">
          <ul className="flex min-w-0 flex-col gap-1.5">{d.jobs.filter((j) => j.state !== "never").slice(0, 4).map((j) => <JobLine key={j.id} j={j} now={now} showAccount={showAccount} />)}</ul>
          <p className="text-[11px] text-muted">
            {[
              d.jobs.filter((j) => j.state !== "never").length > 4 && `+${d.jobs.filter((j) => j.state !== "never").length - 4} more jobs`,
              d.jobs.some((j) => j.state === "never") && `${d.jobs.filter((j) => j.state === "never").length} awaiting first beat`,
              d.idle && `${d.idle} idle`,
              d.noReadPath && `${d.noReadPath} desk${d.noReadPath > 1 ? "s" : ""}: no read path yet`,
              !d.jobs.length && !d.noReadPath && "no jobs for this view",
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {funnel && <Funnel f={funnel} />}
    </section>
  );
}

const PROBE_WORD = { ok: "OK", degraded: "DEGRADED", down: "DOWN", "no-probe": "NO PROBE" } as const;

export function Infra({ probes }: { probes: Probe[] }) {
  return (
    <section aria-labelledby="infra" className="st-card px-3.5 py-3">
      <h2 id="infra" className="text-[13px] uppercase" style={{ fontWeight: 500, letterSpacing: "0.06em" }}><span className="num mr-1.5 text-muted">08</span>KNOX Infra</h2>
      <ul className="mt-2.5 grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-6">
        {probes.map((p) => (
          <li key={p.id} className="st-tile st-desk px-2.5 py-2" data-state={p.status === "down" ? "stuck" : p.status === "no-probe" ? "no-read" : undefined}
            style={p.status === "degraded" ? { borderColor: "var(--warn)" } : undefined}>
            <div className="text-[11px] tracking-[0.04em] uppercase">{p.label}</div>
            <div className={`mt-1 flex items-center gap-1.5 text-[11px] ${p.status === "ok" ? "text-good" : p.status === "degraded" ? "text-[var(--warn)]" : p.status === "down" ? "text-bad" : "text-muted"}`}>
              {p.status === "no-probe" ? <CircleDashed size={10} aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
              {PROBE_WORD[p.status]}
            </div>
            <div className="mt-0.5 text-[11px] leading-snug text-muted">{p.detail}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NeedsYouList({ items, no = "09" }: { items: NeedsYou[]; no?: string }) {
  return (
    <section aria-labelledby="needs" className="st-card px-3.5 py-3">
      <h2 id="needs" className="text-[13px] uppercase" style={{ fontWeight: 500, letterSpacing: "0.06em" }}>
        <span className="num mr-1.5 text-muted">{no}</span>KNOX Needs you · <span className={items.length ? "text-bad" : "text-good"}>{items.length}</span>
      </h2>
      {items.length ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((n, i) => (
            <li key={i} className="flex gap-2 text-[12.5px]">
              <span className="text-bad" aria-hidden>›</span>
              <span>{n.title}<span className="block text-[11px] text-muted">{n.detail}</span></span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-[12px] text-muted">Nothing stuck, nothing down, no gate past its window.</p>}
    </section>
  );
}

const LEVEL = { info: "text-ink", ok: "text-good", fail: "text-bad", warn: "text-[var(--warn)]" } as const;

export function Log({ events, showSource }: { events: StationEvent[]; showSource: boolean }) {
  const lines = [...events].reverse(); // newest at the bottom, like a terminal
  return (
    <section aria-labelledby="log" className="st-card px-3.5 py-3">
      <div className="flex items-baseline justify-between">
        <h2 id="log" className="text-[13px] uppercase" style={{ fontWeight: 500, letterSpacing: "0.06em" }}><span className="num mr-1.5 text-muted">10</span>KNOX Log</h2>
        <span className="label flex items-center gap-1">newest at the bottom <ArrowDown size={10} aria-hidden /> · MYT</span>
      </div>
      {lines.length ? (
        <ol className="mono mt-2 flex max-h-[340px] flex-col gap-0.5 overflow-y-auto text-[11.5px] leading-[1.55]">
          {lines.map((e, i) => (
            <li key={`${e.at}-${i}`} className="grid grid-cols-[58px_34px_1fr] gap-2 sm:grid-cols-[62px_40px_130px_1fr]">
              <span className="text-muted">{clock(e.at)}</span>
              <span className="uppercase text-muted">{e.dept}</span>
              <span className="hidden truncate text-muted sm:block">{e.desk}</span>
              <span className={`break-words ${LEVEL[e.level]}`}>{e.message}{showSource && e.source ? <span className="text-muted"> · {e.source}</span> : null}</span>
            </li>
          ))}
        </ol>
      ) : <p className="mt-2 text-[12px] text-muted">No events yet. Jobs write here when they POST to /api/station/beat.</p>}
    </section>
  );
}

// ---------- five stages and Needs me (owner only) ----------

const shortDay = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// One avatar per stage. Scout finds, Host sets up, Maker makes, Courier posts, Clerk bills.
const STAGE_BOT: Record<StageView["id"], { name: string; color: string }> = {
  audience: { name: "Scout", color: "#8fc98a" }, onboard: { name: "Host", color: "#7fb8d8" }, make: { name: "Maker", color: "#fff347" },
  post: { name: "Courier", color: "#d9a36a" }, paid: { name: "Clerk", color: "#c9a3e0" },
};
const BOT_WORD = { late: "past its window", asleep: "not counting yet", waiting: "waiting on you", idle: "nothing waiting" } as const;

function StageBot({ s, moved }: { s: StageView; moved: boolean }) {
  const bot = STAGE_BOT[s.id];
  const state = s.overdue ? "late" : s.waiting === null ? "asleep" : s.waiting > 0 ? "waiting" : "idle";
  return (
    <span className="st-bot" data-state={state} data-moved={moved || undefined} style={{ "--bot": bot.color } as React.CSSProperties} role="img" aria-label={`${bot.name}: ${BOT_WORD[state]}`}>
      <span className="st-bot-flag" aria-hidden>{state === "late" ? "×" : "!"}</span>
      <span className="st-bot-body" aria-hidden><i /><i /></span>
      <span className="st-bot-legs" aria-hidden><i /><i /></span>
    </span>
  );
}

export function Stages({ stages, now }: { stages: StageView[]; now: number }) {
  // When a stage's count drops between two reads, its avatar takes one short walk: work moved on.
  const before = useRef<Record<string, number | null>>({});
  const [moved, setMoved] = useState<string[]>([]);
  const counts = stages.map((s) => `${s.id}:${s.waiting}`).join(",");
  useEffect(() => {
    const went = stages.filter((s) => { const was = before.current[s.id]; return typeof was === "number" && s.waiting !== null && s.waiting < was; }).map((s) => s.id);
    before.current = Object.fromEntries(stages.map((s) => [s.id, s.waiting]));
    if (!went.length) return;
    setMoved(went);
    const t = setTimeout(() => setMoved([]), 1700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts]);
  const say = (s: StageView) =>
    s.waiting === null ? (s.parts.length ? "no read path yet" : "not counted yet") : s.waiting === 0 ? "nothing waiting" : `${s.waiting} waiting${s.oldestAt ? ` · oldest ${dur(now - Date.parse(s.oldestAt))}` : ""}`;
  return (
    <section aria-label="The five stages" className="st-card">
      <div className="st-floor">
        <ol>
          {stages.map((s) => (
            <li key={s.id} className="st-station" data-late={s.overdue || undefined}>
              <h3><span className="truncate"><span className="mr-1.5">{s.no}</span>{s.name}</span><b className={s.overdue ? "text-bad" : s.waiting ? "text-mark" : ""}>{s.waiting ?? "–"}</b></h3>
              <StageBot s={s} moved={moved.includes(s.id)} />
              <div className="st-say"><b>{STAGE_BOT[s.id].name}</b> · {say(s)}{s.overdue ? " · overdue" : ""}</div>
            </li>
          ))}
        </ol>
        <div className="st-rail" aria-hidden />
      </div>
      <details className="border-t border-line px-3.5 py-2">
        <summary className="cursor-pointer text-[11.5px] text-muted">What each stage is counting</summary>
        <ul className="mt-2 grid gap-x-4 gap-y-1.5 pb-1 text-[11.5px] text-muted sm:grid-cols-2 lg:grid-cols-5">
          {stages.map((s) => (
            <li key={s.id}>
              <span className="text-ink">{s.name}</span>
              {s.parts.length > 0 && <span className="block">{s.parts.map((p) => `${p.label} ${p.waiting ?? "–"}`).join(" · ")}</span>}
              {s.note && <span className="block leading-snug">{s.note}</span>}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export function NeedsMeList({ items, now, onDone }: { items: NeedsMe[]; now: number; onDone?: (n: NeedsMe) => Promise<string | null> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const press = async (n: NeedsMe) => {
    if (!onDone) return;
    if (n.clear === "all" && !window.confirm(`Clear everything waiting here?\n\n${n.title}\n\nEvery line waiting right now gets ticked in ${n.where ?? "its file"}. Nothing is sent to anyone.`)) return;
    setBusy(n.key);
    setError(await onDone(n));
    setBusy(null);
  };
  return (
    <section aria-labelledby="needs-me" className="flex flex-col gap-2">
      <h2 id="needs-me" className="sr-only">KNOX Needs me · {items.length}</h2>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.key} className="st-card grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3.5 py-3">
              <div className="min-w-0">
                <div className="mono text-[10.5px] uppercase" style={{ letterSpacing: "0.08em" }}>
                  <span className="text-mark">{n.stage === "system" ? "System" : n.stage}</span>
                  {n.client && <span className="text-muted"> · {n.client}</span>}
                </div>
                <div className="mt-1 text-[14.5px] break-words" style={{ fontWeight: 500 }}>{n.title}</div>
                <div className="text-[12px] text-muted">{n.detail}</div>
                {n.where && <div className="mono mt-0.5 text-[11px] break-all text-muted">{n.clear ? "ticks a line in" : "act in"}: {n.where}</div>}
                {n.clear && onDone && (
                  <button type="button" disabled={busy !== null} onClick={() => press(n)} className="mt-2.5 inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] bg-[var(--mark)] px-4 text-[13px] text-on-solid hover:brightness-95 disabled:opacity-50" style={{ fontWeight: 600 }}>
                    <Check size={14} aria-hidden /> {busy === n.key ? "Saving…" : n.clear === "all" ? "Clear all" : "Done"}
                  </button>
                )}
              </div>
              <div className={`mono self-start text-right text-[11px] whitespace-nowrap ${n.overdue ? "text-bad" : "text-muted"}`}>
                {n.due && <div>{n.overdue ? "was due" : "due"} {shortDay(n.due)}</div>}
                {n.since && <div>waiting {dur(now - Date.parse(n.since))}</div>}
                {n.overdue && !n.due && n.stage !== "system" && <div>past its window</div>}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="st-card px-3.5 py-3 text-[12.5px] text-muted">Nothing is waiting on you.</p>}
      {error && <p className="text-[12px] text-bad" role="alert">{error}</p>}
      <p className="px-1 text-[11px] text-muted">Overdue first, then nearest due date, then the longest wait. Done takes the item off this list at once; your laptop ticks the line in the notes within about 5 minutes, while its jobs are running. Items without a button are cleared where they live.</p>
    </section>
  );
}
