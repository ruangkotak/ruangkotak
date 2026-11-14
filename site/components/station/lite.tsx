"use client";

// The pieces brought over from Station Lite: the command box, Money, Reports and How it works.
// All of them read what the board already knows. None of them stores, changes or sends anything.

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, PaperPlaneRight } from "@phosphor-icons/react";
import { answerCommand, ASK_MAX, CLIENT_CATEGORIES, ownerReport, type AskRecord, type ClientRecord, type CommandTab, type Snapshot } from "@/lib/station";

const rm = (n: number) => `RM${n.toLocaleString("en-MY")}`;
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="label mb-2.5">{children}</h2>;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-ink"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch {} }}>
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {done ? "Copied" : label}
    </button>
  );
}

/** The box under the header. It answers from the snapshot on this page; nothing is sent to a server. */
export function CommandBar({ snap, onTab }: { snap: Snapshot; onTab: (t: CommandTab) => void }) {
  const [text, setText] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const send = () => {
    const asked = text.trim();
    const a = answerCommand(asked, snap);
    setOut(`> ${asked || "help"}\n${a.reply}`);
    setText("");
    if (a.tab) onTab(a.tab);
  };
  return (
    <section aria-label="Command" className="st-card px-3 py-2.5">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Command" autoComplete="off" spellCheck={false}
          placeholder='Ask KNOX: "needs" · "today" · "money" · "report" · "help"'
          className="min-h-[40px] min-w-0 flex-1 rounded-[8px] border border-line bg-bg px-3 text-[13px] text-ink placeholder:text-muted focus:outline focus:outline-1 focus:outline-[var(--mark)]" />
        <button type="submit" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] border border-line bg-[var(--raised)] px-3.5 text-[13px] hover:border-ink">
          <PaperPlaneRight size={14} aria-hidden /> Ask
        </button>
      </form>
      {out && (
        <div className="mt-2">
          <pre className="mono max-h-[260px] overflow-auto rounded-[8px] border border-line bg-bg px-3 py-2 text-[12px] leading-[1.55] whitespace-pre-wrap break-words" aria-live="polite">{out}</pre>
          <button type="button" onClick={() => setOut(null)} className="mt-1 text-[11px] text-muted underline underline-offset-2 hover:text-ink">hide</button>
        </div>
      )}
    </section>
  );
}

// The desks that have an agent behind them, so an ask comes back as a draft. "" lets the router pick from the words.
const ASK_DESKS: [string, string][] = [
  ["scriptwriter", "Scriptwriter · scripts, hooks"], ["caption-editor", "Caption Editor · captions, hashtags"],
  ["strategist", "Strategist · angles, a campaign plan"], ["account-manager", "Account Manager · a reply to a brand"], ["", "Let the router decide"],
];
const REVIEW_TEMPLATE =
  "write a 45-second product review script for [BRAND] [PRODUCT], for client [CLIENT]. Format: talking head with product b-roll. " +
  "Brand's key facts: [SPEC 1], [SPEC 2], [PRICE]. Must say: [LINE]. Must not say: [LINE]. Test I will run on camera: [TEST]. " +
  "Give 3 hook options. Leave the verdict line blank for me. Posting [DATE] on Instagram & TikTok. CTA: [CALL TO ACTION].";

/** Ask for work from the board. The ask waits on the site until the laptop writes it into Station/Asks.md. */
export function AskBox() {
  const [text, setText] = useState("");
  const [desk, setDesk] = useState("scriptwriter");
  const [waiting, setWaiting] = useState<AskRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/station/asks", { cache: "no-store", credentials: "same-origin" });
      if (res.ok) setWaiting(((await res.json()) as { asks: AskRecord[] }).asks);
    } catch {}
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const blanks = /\[[A-Z0-9 ]+\]/.test(text);
  const send = async () => {
    if (blanks) return setNote({ bad: true, text: "Replace every [BLANK] with the real detail first. The writer only knows what is in the ask." });
    setBusy(true);
    try {
      const res = await fetch("/api/station/asks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, desk }), credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setNote({ bad: true, text: data.error ?? `KNOX answered ${res.status}` });
      else {
        setText("");
        setNote({ bad: false, text: "Saved. Your laptop collects it within about 15 minutes; the draft then shows here under Make as \"Agent drafts waiting for your approval\"." });
        await load();
      }
    } catch {
      setNote({ bad: true, text: "Could not reach KNOX. Nothing was saved." });
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="ask-box" className="st-card px-3.5 py-3">
      <h2 id="ask-box" className="label mb-2.5">KNOX Ask for work</h2>
      <div className="flex flex-col gap-2">
        <textarea value={text} onChange={(e) => { setText(e.target.value); setNote(null); }} maxLength={ASK_MAX} aria-label="What do you need" rows={4}
          placeholder="What do you need? Example: write 3 hook options for the Brand X mic reel, posting 20 Nov. Angle: battery life tested for a full day."
          className="min-h-[96px] w-full resize-y rounded-[8px] border border-line bg-bg px-3 py-2 text-[13px] leading-[1.5] text-ink placeholder:text-muted focus:outline focus:outline-1 focus:outline-[var(--mark)]" />
        <div className="flex flex-wrap items-center gap-2">
          <select value={desk} onChange={(e) => setDesk(e.target.value)} aria-label="Who should do it" className="min-h-[40px] max-w-full rounded-[8px] border border-line bg-bg px-2.5 text-[13px] text-ink">
            {ASK_DESKS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <button type="button" onClick={() => { setText(REVIEW_TEMPLATE); setDesk("scriptwriter"); setNote(null); }} className="inline-flex min-h-[40px] items-center rounded-[6px] border border-line px-3 text-[12px] hover:border-ink">
            Product review template
          </button>
          <button type="button" disabled={busy || text.trim().length < 8} onClick={send} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] bg-[var(--mark)] px-4 text-[13px] text-on-solid hover:brightness-95 disabled:opacity-50" style={{ fontWeight: 600 }}>
            <PaperPlaneRight size={14} aria-hidden /> {busy ? "Saving…" : "Ask"}
          </button>
          <span className="num ml-auto text-[11px] text-muted">{text.length}/{ASK_MAX}</span>
        </div>
        {note && <p className={`text-[12px] ${note.bad ? "text-bad" : "text-good"}`} role={note.bad ? "alert" : "status"}>{note.text}</p>}
        {waiting.length > 0 && (
          <div className="border-t border-line pt-2">
            <div className="label mb-1">Waiting for your laptop to collect · {waiting.length}</div>
            <ul className="flex flex-col gap-1 text-[12px] text-muted">
              {waiting.map((a) => <li key={a.id} className="break-words"><span className="mono text-mark">{a.desk ?? "router"}</span> · {a.text.length > 140 ? `${a.text.slice(0, 140)}…` : a.text}</li>)}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-muted">
          The writer is an agent on your laptop. It has not held the product and cannot browse the web, so give it the facts and keep the verdict for yourself. Nothing is sent to anyone.
        </p>
      </div>
    </section>
  );
}

type Client = Omit<ClientRecord, "keyHash">;

/** Money: what is agreed with each client, and what the Paid stage is counting. Prices are set on the Clients tab. */
export function MoneyTab({ snap, onClients }: { snap: Snapshot; onClients: () => void }) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/station/clients", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => { if (!res.ok) throw new Error(`KNOX answered ${res.status}`); return (await res.json()) as { clients: Client[] }; })
      .then((d) => live && setClients(d.clients))
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [snap.money?.monthly, snap.money?.clients, snap.money?.priced]);

  const m = snap.money;
  const paid = snap.stages?.find((s) => s.id === "paid");
  const tiles: [string, string, string][] = [
    ["Agreed a month", rm(m?.monthly ?? 0), m?.priced ? `from ${m.priced} paying client${m.priced === 1 ? "" : "s"}` : "no paying client yet"],
    ["Clients", String(m?.clients ?? 0), `${m?.priced ?? 0} with a price above RM0`],
    ["Invoices waiting", paid?.waiting === null || paid?.waiting === undefined ? "–" : String(paid.waiting), paid?.waiting === null ? "not counted yet" : paid?.overdue ? "past their window" : "on the invoice checklist"],
  ];
  return (
    <div className="flex flex-col gap-3">
      <section className="st-card px-3.5 py-3">
        <H2>KNOX Money</H2>
        <dl className="grid gap-2 sm:grid-cols-3">
          {tiles.map(([label, value, note]) => (
            <div key={label} className="st-tile px-3 py-2.5">
              <dt className="label">{label}</dt>
              <dd className="num mt-1.5 text-[22px] leading-none">{value}</dd>
              <dd className="mt-1 text-[11px] text-muted">{note}</dd>
            </div>
          ))}
        </dl>
        {m?.invoices && <p className="mt-2.5 text-[12px] text-muted">Last invoice check: {m.invoices}</p>}
      </section>

      <section className="st-card overflow-hidden px-3.5 py-3">
        <H2>KNOX Agreed with each client</H2>
        {error && <p className="text-[12px] text-bad" role="alert">Could not load clients: {error}</p>}
        {clients && !clients.length && <p className="text-[12px] text-muted">No clients yet. Add one on the Clients tab and set their price there.</p>}
        {clients && clients.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] border-collapse text-[12.5px]">
              <thead>
                <tr className="text-left">
                  {["Client", "Type", "Price each", "A month", "Total a month", "Status"].map((h) => <th key={h} className="label border-b border-line px-2 py-1.5 font-normal">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td className="border-b border-line px-2 py-2">{c.label}</td>
                    <td className="border-b border-line px-2 py-2 text-muted">{CLIENT_CATEGORIES.find((k) => k.id === c.category)?.label ?? "not set"}</td>
                    <td className="num border-b border-line px-2 py-2">{c.price === undefined ? <span className="text-mark">not set</span> : rm(c.price)}</td>
                    <td className="num border-b border-line px-2 py-2">{c.perMonth ?? "–"}</td>
                    <td className="num border-b border-line px-2 py-2">{c.price !== undefined && c.perMonth ? rm(c.price * c.perMonth) : "–"}</td>
                    <td className="border-b border-line px-2 py-2 text-muted">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2.5 text-[11.5px] text-muted">
          Prices are set on the <button type="button" onClick={onClients} className="underline underline-offset-2 hover:text-ink">Clients tab</button>. Clients never see them.
        </p>
      </section>

      <section className="st-card px-3.5 py-3">
        <H2>KNOX Quotations and invoices</H2>
        <p className="max-w-[70ch] text-[12.5px] text-muted">
          Not on the board yet. Station Lite could draft these because it kept its own list of documents on your laptop. KNOX keeps no documents, so for now an invoice is made as a PDF outside the board and sent by you, and the Paid stage counts what your invoice checklist says is still open.
        </p>
      </section>
    </div>
  );
}

/** Reports: the whole business as one page of text. A client's own update lives on their account page. */
export function ReportsTab({ snap, onAccount }: { snap: Snapshot; onAccount: (id: string) => void }) {
  const text = ownerReport(snap);
  const others = snap.accounts.filter((a) => a.kind !== "internal");
  return (
    <section className="st-card px-3.5 py-3">
      <H2>KNOX Reports</H2>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <select aria-label="Which report" value={snap.view.account} onChange={(e) => onAccount(e.target.value)}
          className="min-h-[40px] rounded-[8px] border border-line bg-bg px-2.5 text-[13px] text-ink">
          <option value="all">The whole business</option>
          {snap.accounts.filter((a) => a.kind === "internal").map((a) => <option key={a.id} value={a.id}>{a.label} only</option>)}
          {others.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <CopyButton text={text} label="Copy report" />
      </div>
      <pre className="mono rounded-[8px] border border-line bg-bg px-3 py-2.5 text-[12px] leading-[1.6] whitespace-pre-wrap break-words">{text}</pre>
      <p className="mt-2 text-[11.5px] text-muted">
        Built from the numbers on this board right now. Pick an account to see its reels and the update you can send to that client. Nothing is sent from here.
      </p>
    </section>
  );
}

const FLOW: [string, string, string][] = [
  ["Audience", "Scout", "Reply, or drop the lead"], ["Onboard", "Host", "Price and private link"], ["Make", "Maker", "Approve, reject, final check"],
  ["Post", "Courier", "Post it yourself"], ["Paid", "Clerk", "Send invoice, confirm money"],
];

export function HowTab() {
  return (
    <div className="flex flex-col gap-3">
      <section className="st-card px-3.5 py-3">
        <H2>KNOX One line, five stages</H2>
        <svg viewBox="0 0 1000 330" role="img" aria-label="Workflow: Audience, Onboard, Make, Post, Paid. Your laptop counts what is waiting at each stage and you make the decision under it." className="h-auto w-full">
          <defs>
            <marker id="how-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8f9081" /></marker>
          </defs>
          {FLOW.map(([name, bot, you], i) => {
            const x = 20 + i * 196;
            return (
              <g key={name}>
                <rect x={x} y={20} width={176} height={78} rx={10} fill="#22221d" stroke="#2f2f28" />
                <text x={x + 14} y={46} fontSize={11} fill="#8f9081" letterSpacing={1.5}>0{i + 1}</text>
                <text x={x + 38} y={47} fontSize={16} fill="#f2f1ea" fontWeight={600}>{name}</text>
                <text x={x + 14} y={78} fontSize={12} fill="#8f9081">avatar: {bot}</text>
                <path d={`M${x + 88} 98 L${x + 88} 156`} stroke="#45453b" strokeDasharray="3 3" />
                <rect x={x} y={158} width={176} height={46} rx={23} fill="none" stroke="#fff347" />
                <text x={x + 88} y={177} textAnchor="middle" fontSize={10} fill="#fff347" letterSpacing={1.5}>YOU DECIDE</text>
                <text x={x + 88} y={194} textAnchor="middle" fontSize={11.5} fill="#f2f1ea">{you}</text>
                {i < 4 && <path d={`M${x + 178} 59 L${x + 194} 59`} stroke="#8f9081" strokeWidth={1.5} markerEnd="url(#how-ar)" />}
              </g>
            );
          })}
          <rect x={20} y={246} width={960} height={64} rx={8} fill="#1a1a16" stroke="#45453b" strokeDasharray="4 4" />
          <text x={500} y={272} textAnchor="middle" fontSize={13} fill="#f2f1ea" fontWeight={600}>Your laptop reads your notes every minute and sends only the counts here</text>
          <text x={500} y={292} textAnchor="middle" fontSize={11.5} fill="#8f9081">A Done press is kept on the site until the laptop collects it and ticks the line in your notes</text>
        </svg>
      </section>
      <section className="st-card px-3.5 py-3 text-[13px] leading-[1.6]">
        <H2>KNOX In plain words</H2>
        <ol className="flex max-w-[72ch] list-decimal flex-col gap-1.5 pl-5">
          <li><b>Audience.</b> New comments, DMs and briefs are counted from your notes. You reply yourself, then press Done or Clear all.</li>
          <li><b>Onboard.</b> Add a client on the Clients tab, set the price per reel and send them their private link.</li>
          <li><b>Make.</b> Drafts wait for your Approve or Reject on Needs me. Finished pieces wait for your final check.</li>
          <li><b>Post.</b> Anything approved and not yet live is counted here. You post it by hand. KNOX never touches Instagram.</li>
          <li><b>Paid.</b> Open invoices are counted from your invoice checklist. You send them and confirm the money.</li>
        </ol>
        <H2><span className="mt-4 block">KNOX What is different from Station Lite</span></H2>
        <ul className="flex max-w-[72ch] list-disc flex-col gap-1.5 pl-5 text-muted">
          <li>The layout is Lite&apos;s. The numbers are real, read from your notes and your Instagram reels.</li>
          <li>The avatars stand for the stages. They walk when work moves on; they do not invent leads or scripts as Lite&apos;s did.</li>
          <li>Ask for work on the Needs me tab. Your laptop collects the ask, an agent drafts it, and the draft comes back under Make.</li>
          <li>The command box only reads the board back to you. Quotations, invoices and brief upload are not here yet, because KNOX does not store those documents.</li>
          <li>Nothing is ever sent for you: no DM, no draft, no invoice.</li>
        </ul>
      </section>
    </div>
  );
}
