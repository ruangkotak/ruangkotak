"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/station";
import { AccountPanel } from "./account";
import { Clients } from "./clients";
import { TelegramPanel } from "./telegram";
import { DraftReview } from "./drafts";
import { Carousel } from "./carousel";
import { AskBox, CommandBar, HowTab, MoneyTab, ReportsTab } from "./lite";
import { DeptCard, dur, Gates, HealthStats, Infra, jobTag, Log, NeedsMeList, NeedsYouList, Pips, Stages, TopBar } from "./parts";

const POLL_MS = 30_000;
// The owner gets Station Lite's tabs. A client keeps the three pages they have always had.
const OWNER_TABS = [
  { id: "needs", label: "Needs me" },
  { id: "clients", label: "Clients" },
  { id: "carousel", label: "Carousel" },
  { id: "money", label: "Money" },
  { id: "reports", label: "Reports" },
  { id: "health", label: "Health" }, // what used to be Mission, Jobs and Alerts
  { id: "how", label: "How it works" },
] as const;
const CLIENT_TABS = [
  { id: "station", label: "Mission" },
  { id: "jobs", label: "Jobs" },
  { id: "alerts", label: "Alerts" },
] as const;
type Tab = (typeof OWNER_TABS)[number]["id"] | (typeof CLIENT_TABS)[number]["id"];
// Old links and bookmarks: the owner's Mission, Jobs and Alerts pages are now one Health tab.
const MOVED: Record<string, Tab> = { station: "health", jobs: "health", alerts: "health", agents: "health" };

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
  const tabs: readonly { id: Tab; label: string }[] = canSwitch ? OWNER_TABS : CLIENT_TABS;
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
    const fromHash = ((canSwitch ? MOVED[hash] : hash === "agents" ? "jobs" : undefined) ?? hash) as Tab;
    if (tabs.some((t) => t.id === fromHash)) setTab(fromHash);
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
  // While the owner previews a client page, they see exactly what that client sees: the client's three tabs.
  const owner = canSwitch && !client;
  const shownTabs = owner ? tabs : CLIENT_TABS;
  const shown: Tab = shownTabs.some((t) => t.id === tab) ? tab : owner ? "needs" : "station";
  const health = shown === "health";
  // The account row matters where accounts are compared (Health, Reports), and whenever one is already picked.
  const showAccounts = client || !owner || health || shown === "reports" || snap.view.account !== "all";

  return (
    <div className="rk-station min-h-[100dvh] bg-bg text-ink">
      <main className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 pt-4 pb-10 md:px-6">
        <TopBar s={snap} now={now} online={online} />
        {owner && <CommandBar snap={snap} onTab={pick} />}
        {owner && snap.stages && <Stages stages={snap.stages} now={now} />}

        <nav aria-label="KNOX Mission Control sections" className="flex flex-wrap items-center gap-1.5">
          {shownTabs.map(({ id, label }) => {
            const count = id === "alerts" || id === "health" ? alerts : id === "needs" ? waiting : 0;
            return (
              <button key={id} onClick={() => pick(id)} aria-current={shown === id ? "page" : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] ${shown === id ? "border-mark text-mark" : "border-line text-muted hover:text-ink"}`}>
                {label}
                {count > 0 && <span className={`num ml-1.5 ${id === "needs" ? "text-mark" : "text-bad"}`}>{count}</span>}
              </button>
            );
          })}
        </nav>

        {showAccounts && <nav aria-label="Account" className="flex flex-wrap items-center gap-1.5">
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
              {snap.view.account !== "all" && snap.accounts.find((a) => a.id === snap.view.account)?.kind !== "internal" && (
                <button onClick={() => switchTo(`view=client&account=${encodeURIComponent(snap.view.account)}`)} className="px-2 py-1 text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                  preview as client
                </button>
              )}
            </>
          )}
        </nav>}

        {shown === "needs" && snap.needsMe && (
          <>
            {owner && <AskBox />}
            <DraftReview onChanged={load} />
            <NeedsMeList items={snap.needsMe} now={now} onDone={done} />
          </>
        )}

        {shown === "clients" && owner && <Clients onChanged={load} />}
        {shown === "carousel" && owner && <Carousel embedded />}
        {shown === "money" && owner && <MoneyTab snap={snap} onClients={() => pick("clients")} />}
        {shown === "reports" && owner && (
          <>
            <ReportsTab snap={snap} onAccount={(id) => switchTo(id === "all" ? "" : `account=${encodeURIComponent(id)}`)} />
            {snap.account && <AccountPanel p={snap.account} now={now} client={false} />}
          </>
        )}
        {shown === "how" && owner && <HowTab />}

        {health && snap.alerts !== undefined && <TelegramPanel on={snap.alerts} />}

        {(shown === "station" || health) && (
          <>
            {!client && <HealthStats s={snap} now={now} />}
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

        {(shown === "jobs" || health) && (
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

        {(shown === "jobs" || health) && (
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

        {(shown === "alerts" || health) && (
          <>
            {!health && snap.alerts !== undefined && <TelegramPanel on={snap.alerts} />}
            {!health && <NeedsYouList items={snap.needsYou} />}
            <section className="st-card px-3.5 py-3">
              <h2 className="label">KNOX Late or failed once</h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
                {allJobs.filter((j) => j.state === "failing" || j.state === "due").map((j) => (
                  <li key={j.id}><span className="mono">{j.id}</span> <span className="text-muted">· {j.deskName} · {j.reason ?? jobTag(j, now)}</span></li>
                ))}
                {!allJobs.some((j) => j.state === "failing" || j.state === "due") && <li className="text-muted">None.</li>}
              </ul>
            </section>
            {!health && snap.infra && <Infra probes={snap.infra.filter((p) => p.status !== "ok")} />}
          </>
        )}
      </main>

    </div>
  );
}
