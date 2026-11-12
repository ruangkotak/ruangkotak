"use client";

import { Bell, Broadcast, Handshake, ListChecks, Tray } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/station";
import { AccountPanel } from "./account";
import { Clients } from "./clients";
import { TelegramPanel } from "./telegram";
import { DeptCard, dur, Gates, Infra, jobTag, Log, NeedsMeList, NeedsYouList, Pips, Stages, TopBar } from "./parts";

const POLL_MS = 30_000;
const TABS = [
  { id: "needs", label: "Needs me", Icon: Tray }, // owner only: the one queue, and where the owner lands
  { id: "station", label: "Mission", Icon: Broadcast },
  { id: "jobs", label: "Jobs", Icon: ListChecks }, // jobs, then the desks and agents behind them
  { id: "alerts", label: "Alerts", Icon: Bell },
  { id: "clients", label: "Clients", Icon: Handshake }, // owner only
] as const;
type Tab = (typeof TABS)[number]["id"];
const OWNER_ONLY = new Set<Tab>(["needs", "clients"]);

// Where each department sits on wide screens (12 columns). Phones stack everything in one column.
const SPAN: Record<string, string> = {
  cmo: "md:col-span-6", cdo: "md:col-span-6", coo: "md:col-span-6 xl:col-span-5",
  router: "md:col-span-6 xl:col-span-2", cfo: "md:col-span-12 xl:col-span-5", cto: "md:col-span-12",
};

const queryOf = (s: Snapshot["view"]) =>
  s.mode === "client" ? `view=client&account=${encodeURIComponent(s.account)}` : s.account === "all" ? "" : `account=${encodeURIComponent(s.account)}`;

export function Station({ initial, canSwitch }: { initial: Snapshot; canSwitch: boolean }) {
  const [snap, setSnap] = useState(initial);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.parse(initial.now)); // server time first, so the first render matches
  const home: Tab = canSwitch ? "needs" : "station";
  const [tab, setTab] = useState<Tab>(home);
  const query = useRef(queryOf(initial.view));

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/station/state${query.current ? `?${query.current}` : ""}`, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      setSnap(await res.json());
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    const hash = location.hash.slice(1);
    const fromHash = (hash === "agents" ? "jobs" : hash) as Tab; // the Agents tab moved into Jobs
    if (TABS.some((t) => t.id === fromHash) && (!OWNER_ONLY.has(fromHash) || canSwitch)) setTab(fromHash);
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    // Poll only while the tab is visible; catch up at once when it comes back.
    const poll = setInterval(() => !document.hidden && load(), POLL_MS);
    const wake = () => !document.hidden && (setNow(Date.now()), load());
    document.addEventListener("visibilitychange", wake);
    const off = () => setOnline(false);
    window.addEventListener("online", wake);
    window.addEventListener("offline", off);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", off);
    };
  }, [load]);

  /** A Done press on Needs me: remember it on Station, then reload. Returns the error to show, or null. */
  const done = useCallback(async (n: { key: string }) => {
    try {
      const res = await fetch("/api/station/done", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: n.key }), credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) return data.error ?? `KNOX answered ${res.status}`;
      await load();
      return null;
    } catch {
      return "Could not reach KNOX. Nothing was changed.";
    }
  }, [load]);

  const pick = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `${location.pathname}${location.search}${t === home ? "" : `#${t}`}`);
    window.scrollTo({ top: 0 });
  };

  const switchTo = (q: string) => {
    query.current = q;
    history.replaceState(null, "", `/station${q ? `?${q}` : ""}${location.hash}`);
    load();
  };

  const client = snap.view.mode === "client";
  const showAccount = !client && snap.view.account === "all";
  const allJobs = snap.departments.flatMap((d) => d.jobs);
  const alerts = snap.needsYou.length;
  const waiting = snap.needsMe?.length ?? 0;
  // The queue belongs to the owner view. While previewing a client page, the Needs me tab shows that page instead.
  const shown: Tab = tab === "needs" && !snap.needsMe ? "station" : tab;

  return (
    <div className="rk-station min-h-[100dvh] bg-bg text-ink">
      <main className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 pt-4 pb-28 md:px-6">
        <TopBar s={snap} now={now} online={online} />

        <nav aria-label="Account" className="flex flex-wrap items-center gap-1.5">
          {client ? (
            <span className="text-[12px] text-muted">
              {snap.accounts[0]?.label} · client view{canSwitch && <> · <button className="underline underline-offset-2" onClick={() => switchTo("")}>back to owner view</button></>}
            </span>
          ) : (
            <>
              {[{ id: "all", label: "All accounts" }, ...snap.accounts].map((a) => (
                <button key={a.id} onClick={() => switchTo(a.id === "all" ? "" : `account=${encodeURIComponent(a.id)}`)} aria-pressed={snap.view.account === a.id}
                  className={`rounded-full border px-3 py-1 text-[12px] ${snap.view.account === a.id ? "border-mark text-mark" : "border-line text-muted hover:text-ink"}`}>
                  {a.label}
                </button>
              ))}
              {canSwitch && <a href="/station/carousel" className="px-2 py-1 text-[12px] text-muted underline underline-offset-2 hover:text-ink">carousel studio</a>}
              {snap.view.account !== "all" && snap.accounts.find((a) => a.id === snap.view.account)?.kind !== "internal" && (
                <button onClick={() => switchTo(`view=client&account=${encodeURIComponent(snap.view.account)}`)} className="px-2 py-1 text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                  preview as client
                </button>
              )}
            </>
          )}
        </nav>

        {shown === "needs" && snap.stages && snap.needsMe && (
          <>
            <Stages stages={snap.stages} now={now} />
            <NeedsMeList items={snap.needsMe} now={now} onDone={done} />
          </>
        )}

        {shown === "station" && (
          <>
            {snap.stages && <Stages stages={snap.stages} now={now} />}
            {snap.account && <AccountPanel p={snap.account} now={now} client={client} />}
            <Gates gates={snap.gates} now={now} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              {snap.departments.map((d) => (
                <DeptCard key={d.id} d={d} now={now} showAccount={showAccount} className={client ? "md:col-span-6" : SPAN[d.id] ?? "md:col-span-6"}
                  funnel={d.id === "cmo" ? snap.funnel : undefined} />
              ))}
            </div>
            {snap.infra && <Infra probes={snap.infra} />}
            <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <NeedsYouList items={snap.needsYou} />
              <Log events={snap.log} showSource={!client} />
            </div>
          </>
        )}

        {shown === "jobs" && (
          <section aria-label="Desks and agents" className="order-last grid gap-3 md:grid-cols-2">
            {snap.departments.map((d) => (
              <div key={d.id} className="st-card px-3.5 py-3">
                <h2 className="text-[13px] uppercase" style={{ fontWeight: 500, letterSpacing: "0.06em" }}><span className="num mr-1.5 text-muted">{d.no}</span>KNOX {d.name}</h2>
                <ul className="mt-2 divide-y divide-line">
                  {d.desks.map((k) => {
                    const jobs = d.jobs.filter((j) => j.desk === k.id);
                    return (
                      <li key={k.id} className="flex items-start justify-between gap-3 py-2">
                        <div>
                          <div className="text-[13px]">{k.name}</div>
                          <div className="text-[11px] text-muted">
                            {k.agent ? <>agent <span className="mono">{k.agent}</span></> : "no agent file"}{jobs.length ? ` · ${jobs.map((j) => j.id).join(", ")}` : ""}
                          </div>
                        </div>
                        <span className={`mono shrink-0 text-[10.5px] uppercase ${k.state === "stuck" || k.state === "failing" ? "text-bad" : k.state === "running" || k.state === "due" ? "text-mark" : "text-muted"}`}>
                          {k.state === "no-read" ? "no read path" : k.state}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        )}

        {shown === "jobs" && (
          <section className="st-card overflow-hidden">
            <ul className="divide-y divide-line">
              {allJobs.sort((a, b) => (a.nextAt ?? "~").localeCompare(b.nextAt ?? "~")).map((j) => {
                const tag = jobTag(j, now);
                return (
                  <li key={j.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3.5 py-2.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_110px_auto]">
                    <div className="min-w-0">
                      <div className="mono truncate text-[12.5px]">{j.id}</div>
                      <div className="text-[11px] text-muted">{j.deskName} · {j.dept.toUpperCase()}</div>
                    </div>
                    <span className={`mono self-center text-right text-[10.5px] md:order-4 md:text-left ${j.state === "stuck" || j.state === "failing" ? "text-bad" : j.state === "running" || tag === "DUE NOW" ? "text-mark" : "text-muted"}`}>{tag}</span>
                    <div className="mono self-center text-[11px] text-muted md:order-2">{j.schedule}{showAccount ? ` · ${j.account}` : ""}</div>
                    <div className="self-center text-[11px] text-muted md:order-3">{j.startedAt ? `started ${dur(now - Date.parse(j.startedAt))} ago` : j.lastEndAt ? `last ${dur(now - Date.parse(j.lastEndAt))} ago` : "no runs yet"}</div>
                    <div className="col-span-2 self-center md:order-5 md:col-span-1"><Pips runs={j.runs} /></div>
                    {(j.reason || j.lastMessage) && <div className={`col-span-2 min-w-0 break-words text-[11px] md:order-6 md:col-span-5 ${j.reason ? "text-bad" : "text-muted"}`}>{j.reason ?? j.lastMessage}</div>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {shown === "clients" && canSwitch && <Clients onChanged={load} />}

        {shown === "alerts" && (
          <>
            {snap.alerts !== undefined && <TelegramPanel on={snap.alerts} />}
            <NeedsYouList items={snap.needsYou} />
            <section className="st-card px-3.5 py-3">
              <h2 className="label">KNOX Late or failed once</h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
                {allJobs.filter((j) => j.state === "failing" || j.state === "due").map((j) => (
                  <li key={j.id}><span className="mono">{j.id}</span> <span className="text-muted">· {j.deskName} · {j.reason ?? jobTag(j, now)}</span></li>
                ))}
                {!allJobs.some((j) => j.state === "failing" || j.state === "due") && <li className="text-muted">None.</li>}
              </ul>
            </section>
            {snap.infra && <Infra probes={snap.infra.filter((p) => p.status !== "ok")} />}
          </>
        )}
      </main>

      <nav aria-label="KNOX Mission Control sections" className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <ul className={`mx-auto grid max-w-[640px] ${canSwitch ? "grid-cols-5" : "grid-cols-3"}`}>
          {TABS.filter((t) => !OWNER_ONLY.has(t.id) || canSwitch).map(({ id, label, Icon }) => (
            <li key={id}>
              <button onClick={() => pick(id)} aria-current={tab === id ? "page" : undefined}
                className={`relative flex min-h-[56px] w-full flex-col items-center justify-center gap-1 text-[10.5px] tracking-[0.1em] uppercase ${tab === id ? "text-ink" : "text-muted"}`}>
                <Icon size={18} weight={tab === id ? "fill" : "regular"} aria-hidden />
                {label}
                {id === "alerts" && alerts > 0 && <span className="num absolute top-2 right-[calc(50%-20px)] rounded-full bg-bad px-1.5 text-[9.5px] leading-[15px] text-on-solid">{alerts}</span>}
                {id === "needs" && waiting > 0 && <span className="num absolute top-2 right-[calc(50%-20px)] rounded-full bg-[var(--mark)] px-1.5 text-[9.5px] leading-[15px] text-on-solid">{waiting}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
