"use client";

import { ArrowsClockwise, Check, CheckCircle, Circle, Copy, Eye, PauseCircle, PlayCircle, Trash, UserPlus } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { CLIENT_CATEGORIES, cutOf, type ClientCategory, type ClientRecord, type OnboardingStep, type TalentJob } from "@/lib/station";

type Client = Omit<ClientRecord, "keyHash"> & { steps: OnboardingStep[] };
type Issued = { id: string; label: string; key: string; fresh: boolean };

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }) : "");
const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 31).replace(/-+$/, "");

const catOf = (id?: ClientCategory) => CLIENT_CATEGORIES.find((c) => c.id === id);
// The headings on the tab, in order. Clients added before categories existed sit under the last one until you pick.
const GROUPS: { title: string; ids: (ClientCategory | undefined)[]; note: string }[] = [
  { title: "Creator / Talent", ids: ["creator", "talent"], note: "Creators on a retainer who pay us, and our own talent." },
  { title: "Brand", ids: ["brand"], note: "Brands offering a job to @alanazizreview." },
  { title: "No category yet", ids: [undefined], note: "Pick Creator, Talent or Brand on each card." },
];

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/station/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; key?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? `KNOX answered ${res.status}`);
  return data;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {}
      }}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-ink"
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}

/** The link and a ready-to-send message, shown once after Add or New link. */
function IssuedLink({ issued, onDone }: { issued: Issued; onDone: () => void }) {
  const link = `${location.origin}/station?account=${encodeURIComponent(issued.id)}&key=${encodeURIComponent(issued.key)}`;
  const message = `Hi ${issued.label}, here is your private RUANGKOTAK KNOX Mission Control link: ${link}\n\nIt shows your content jobs and what is waiting in final review, updated through the day. Please keep it to yourself: anyone with the link can see your page.`;
  return (
    <section className="st-card px-3.5 py-3" style={{ borderColor: "var(--mark)" }} aria-live="polite">
      <h2 className="text-[13px]" style={{ fontWeight: 500 }}>{issued.fresh ? `${issued.label} is set up` : `New link for ${issued.label}`}</h2>
      <p className="mt-1 text-[12px] text-muted">
        Copy it now: this is the only time the link is shown. {issued.fresh ? "" : "The old link has stopped working. "}If it gets lost, make a new one.
      </p>
      <div className="mono mt-2.5 rounded-[6px] border border-line bg-[var(--raised)] px-2.5 py-2 text-[11.5px] break-all">{link}</div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <CopyButton text={link} label="Copy link" />
        <CopyButton text={message} label="Copy message for WhatsApp" />
        <a href={`/station?view=client&account=${encodeURIComponent(issued.id)}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-ink">
          <Eye size={14} aria-hidden /> See what they see
        </a>
        <button type="button" onClick={onDone} className="min-h-[40px] px-3 text-[12px] text-muted underline underline-offset-2 hover:text-ink">I have copied it</button>
      </div>
    </section>
  );
}

function AddClient({ onAdded }: { onAdded: (i: Issued) => void }) {
  const [label, setLabel] = useState("");
  const [instagram, setInstagram] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [category, setCategory] = useState<ClientCategory | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = slugEdited ? slug : slugify(label);

  return (
    <form
      className="st-card px-3.5 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const r = await call({ action: "create", label, instagram, slug: shown, category });
          onAdded({ id: shown, label: label.trim(), key: r.key!, fresh: true });
          setLabel("");
          setInstagram("");
          setSlug("");
          setSlugEdited(false);
          setCategory("");
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="flex items-center gap-2 text-[13px]" style={{ fontWeight: 500 }}><UserPlus size={16} aria-hidden /> KNOX Add a client</h2>
      <p className="mt-1 text-[12px] text-muted">
        They get a private link to their own page: their content jobs and what is waiting in final review. Their reel velocity
        and final-review jobs start on your laptop by themselves; no deploy, no settings to change.
      </p>
      <fieldset className="mt-3">
        <legend className="text-[12px]">What are they?</legend>
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
          {CLIENT_CATEGORIES.map((k) => (
            <label key={k.id} className={`st-tile flex cursor-pointer items-start gap-2 px-2.5 py-2 text-[12px] ${category === k.id ? "!border-[var(--mark)]" : ""}`}>
              <input type="radio" name="category" value={k.id} checked={category === k.id} onChange={() => setCategory(k.id)} required className="mt-0.5 accent-[var(--mark)]" />
              <span><span className="block text-[13px]">{k.label}</span><span className="text-[11px] text-muted">{k.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3 sm:items-end">
        <label className="flex flex-col gap-1 text-[12px]">
          Name
          <input className="field !min-h-[42px]" required minLength={2} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Kopi Kita" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">
          <span>Instagram handle <span className="text-muted">(optional)</span></span>
          <input className="field !min-h-[42px]" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@kopikita" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">
          <span>Short name <span className="text-muted">(in links and file names)</span></span>
          <input
            className="field mono !min-h-[42px]"
            value={shown}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            pattern="[a-z0-9][a-z0-9-]{1,30}"
            placeholder="kopi-kita"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-[12px] text-bad" role="alert">{error}</p>}
      <button type="submit" disabled={busy || label.trim().length < 2 || !category} className="mt-3 inline-flex min-h-[42px] items-center gap-2 rounded-[6px] bg-[var(--mark)] px-4 text-[13px] text-[var(--on-solid)] disabled:opacity-50">
        {busy ? "Setting up…" : "Add client and make their link"}
      </button>
    </form>
  );
}

const rm = (n: number) => `RM${n.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;
const todayMyt = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** Talent only: our percentage, and each job a brand gave them. Only the owner ever sees this. */
function TalentTerms({ c, busy, act }: { c: Client; busy: string | null; act: (action: string, extra?: Record<string, unknown>, confirmText?: string) => Promise<void> }) {
  const [commission, setCommission] = useState(c.commission === undefined ? "" : String(c.commission));
  const [brand, setBrand] = useState("");
  const [fee, setFee] = useState("");
  const [date, setDate] = useState(todayMyt);
  const [percent, setPercent] = useState("");
  const jobs: TalentJob[] = [...(c.jobs ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const total = jobs.reduce((n, j) => n + cutOf(j), 0), open = jobs.filter((j) => !j.paidAt).reduce((n, j) => n + cutOf(j), 0);
  const rate = percent === "" ? c.commission : Number(percent);
  const preview = fee && rate !== undefined && Number.isFinite(Number(fee)) ? cutOf({ fee: Number(fee), percent: rate }) : null;
  return (
    <div className="mt-2.5 flex flex-col gap-2.5">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act("update", { commission }); }}>
        <label className="flex flex-col gap-1 text-[12px]">
          Our commission per job (%)
          <input className="field !min-h-[40px] sm:w-[160px]" type="number" min={0} max={100} step="any" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="not set" />
        </label>
        <button type="submit" disabled={!!busy} className="min-h-[40px] rounded-[6px] border border-line px-3 text-[12px] hover:border-ink disabled:opacity-50">Save commission</button>
        <span className="pb-2.5 text-[11.5px] text-muted">only you see this</span>
      </form>

      <div className="rounded-[6px] border border-line">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-2.5 py-2">
          <span className="label">Jobs · {jobs.length}</span>
          <span className="text-[11.5px] text-muted">our share {rm(total)}{open ? <> · <span className="text-mark">{rm(open)} not received</span></> : null}</span>
        </div>
        {jobs.length ? (
          <ul className="divide-y divide-line">
            {jobs.map((j) => (
              <li key={j.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-2.5 py-2 text-[12px]">
                <div className="min-w-0">
                  <div className="break-words">{j.brand} <span className="text-muted">· {day(`${j.date}T00:00:00+08:00`)}</span></div>
                  <div className="num text-[11.5px] text-muted">fee {rm(j.fee)} · {j.percent}% · <span className="text-ink">our share {rm(cutOf(j))}</span></div>
                </div>
                <div className="flex items-center gap-1">
                  {j.paidAt
                    ? <button type="button" disabled={!!busy} onClick={() => act("job-unpaid", { jobId: j.id })} className="inline-flex min-h-[36px] items-center gap-1 rounded-[6px] px-2 text-[11.5px] text-good hover:underline disabled:opacity-50"><CheckCircle size={14} weight="fill" aria-hidden /> received {day(j.paidAt)}</button>
                    : <button type="button" disabled={!!busy} onClick={() => act("job-paid", { jobId: j.id })} className="min-h-[36px] rounded-[6px] border border-line px-2.5 text-[11.5px] hover:border-ink disabled:opacity-50">Mark received</button>}
                  <button type="button" disabled={!!busy} aria-label={`Remove the ${j.brand} job`} onClick={() => act("job-remove", { jobId: j.id }, `Remove the ${j.brand} job (${rm(j.fee)})? This cannot be undone.`)} className="inline-flex min-h-[36px] items-center px-1.5 text-bad hover:underline disabled:opacity-50"><Trash size={14} aria-hidden /></button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="px-2.5 py-2 text-[12px] text-muted">No jobs yet. Add one when a brand or agency confirms a job for {c.label}.</p>}
        <form className="flex flex-wrap items-end gap-2 border-t border-line px-2.5 py-2.5"
          onSubmit={async (e) => { e.preventDefault(); await act("job-add", { brand, fee, date, percent }); setBrand(""); setFee(""); setPercent(""); }}>
          <label className="flex flex-col gap-1 text-[12px]">Brand or agency<input className="field !min-h-[40px] sm:w-[170px]" required minLength={2} maxLength={60} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand X" autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-[12px]">Job fee (RM)<input className="field !min-h-[40px] sm:w-[120px]" required type="number" min={1} step="any" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="3000" /></label>
          <label className="flex flex-col gap-1 text-[12px]">Job date<input className="field !min-h-[40px]" required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-[12px]"><span>% <span className="text-muted">(blank = {c.commission ?? "set above"})</span></span><input className="field !min-h-[40px] sm:w-[90px]" type="number" min={0} max={100} step="any" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder={c.commission === undefined ? "" : String(c.commission)} /></label>
          <button type="submit" disabled={!!busy || !brand.trim() || !fee} className="min-h-[40px] rounded-[6px] bg-[var(--mark)] px-3.5 text-[12.5px] text-[var(--on-solid)] disabled:opacity-50">Add job</button>
          {preview !== null && <span className="num pb-2.5 text-[11.5px] text-muted">our share {rm(preview)}</span>}
        </form>
      </div>
    </div>
  );
}

function ClientCard({ c, onChange, onIssued }: { c: Client; onChange: () => void; onIssued: (i: Issued) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState(c.instagram ?? "");
  const [price, setPrice] = useState(c.price === undefined ? "" : String(c.price));
  const [perMonth, setPerMonth] = useState(c.perMonth === undefined ? "" : String(c.perMonth));
  const monthly = c.price !== undefined && c.perMonth ? c.price * c.perMonth : null;
  const act = async (action: string, extra: Record<string, unknown> = {}, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setError(null);
    try {
      const r = await call({ action, id: c.id, ...extra });
      if (action === "rotate" && r.key) onIssued({ id: c.id, label: c.label, key: r.key, fresh: false });
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const paused = c.status === "paused";
  const done = c.steps.filter((s) => s.done).length;
  const cat = catOf(c.category);
  const brand = c.category === "brand";

  return (
    <li className="st-card px-3.5 py-3" style={paused ? { opacity: 0.7 } : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            {c.label}
            <span className={`label rounded-full border px-2 py-0.5 ${cat ? "border-[var(--mark)] !text-[var(--mark)]" : "border-line"}`}>{cat ? (c.category === "creator" ? "Creator · retainer" : cat.label) : "no category"}</span>
          </div>
          <div className="text-[11.5px] text-muted">
            <span className="mono">{c.id}</span>{c.instagram ? ` · @${c.instagram}` : ""} · added {day(c.createdAt)}
            {c.lastSeenAt ? ` · last opened ${day(c.lastSeenAt)}` : ""}
          </div>
        </div>
        <span className={`label rounded-full border px-2 py-1 ${paused ? "border-line" : "border-[var(--good)] text-good"}`}>{paused ? "paused" : `${done}/${c.steps.length} set up`}</span>
      </div>

      <label className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px]">
        Category
        <select value={c.category ?? ""} disabled={!!busy} onChange={(e) => act("update", { category: e.target.value })} className="min-h-[36px] rounded-[6px] border border-line bg-bg px-2 text-[12px] text-ink">
          {!c.category && <option value="">Pick one…</option>}
          {CLIENT_CATEGORIES.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        {cat && <span className="text-[11px] text-muted">{cat.hint}</span>}
      </label>

      <ol className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
        {c.steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-[12px]">
            {s.done ? <CheckCircle size={16} weight="fill" className="mt-px shrink-0 text-good" aria-label="done" /> : <Circle size={16} className="mt-px shrink-0 text-muted" aria-label="not yet" />}
            <span>
              {s.label}
              {s.done && s.at ? <span className="text-muted"> · {day(s.at)}</span> : null}
              {s.note ? <span className="block text-[11px] text-muted">{s.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      {!c.instagram && !paused && (
        <form
          className="mt-2.5 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act("update", { instagram: handle });
          }}
        >
          <label className="flex flex-col gap-1 text-[12px]">
            Add their Instagram handle to start reel velocity
            <input className="field !min-h-[40px] sm:w-[220px]" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" autoCapitalize="none" spellCheck={false} />
          </label>
          <button type="submit" disabled={!handle.trim() || !!busy} className="min-h-[40px] rounded-[6px] border border-line px-3 text-[12px] hover:border-ink disabled:opacity-50">Save</button>
        </form>
      )}

      {!paused && c.category === "talent" && <TalentTerms c={c} busy={busy} act={act} />}

      {!paused && c.category !== "talent" && (
        <form
          className="mt-2.5 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act("update", { price, perMonth });
          }}
        >
          <label className="flex flex-col gap-1 text-[12px]">
            {brand ? "Fee per video (RM)" : "Price per reel (RM)"}
            <input className="field !min-h-[40px] sm:w-[140px]" type="number" min={0} step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="not set" />
          </label>
          <label className="flex flex-col gap-1 text-[12px]">
            {brand ? "Videos per month" : "Reels per month"}
            <input className="field !min-h-[40px] sm:w-[120px]" type="number" min={1} max={60} step={1} inputMode="numeric" value={perMonth} onChange={(e) => setPerMonth(e.target.value)} placeholder="not set" />
          </label>
          <button type="submit" disabled={!!busy} className="min-h-[40px] rounded-[6px] border border-line px-3 text-[12px] hover:border-ink disabled:opacity-50">Save price</button>
          <span className="pb-2.5 text-[11.5px] text-muted">{monthly !== null ? `RM${monthly.toLocaleString("en-MY")} a month · only you see this` : "only you see this"}</span>
        </form>
      )}

      {error && <p className="mt-2 text-[12px] text-bad" role="alert">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
        {!paused && (
          <a href={`/station?view=client&account=${encodeURIComponent(c.id)}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] text-muted hover:text-ink">
            <Eye size={14} aria-hidden /> See what they see
          </a>
        )}
        <button type="button" disabled={!!busy || paused} onClick={() => act("rotate", {}, `Make a new link for ${c.label}? Their current link stops working straight away.`)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] text-muted hover:text-ink disabled:opacity-40">
          <ArrowsClockwise size={14} aria-hidden /> New link
        </button>
        <button type="button" disabled={!!busy} onClick={() => act(paused ? "resume" : "pause", {}, paused ? undefined : `Pause ${c.label}? Their link stops working and their jobs stop until you resume.`)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] text-muted hover:text-ink disabled:opacity-40">
          {paused ? <PlayCircle size={14} aria-hidden /> : <PauseCircle size={14} aria-hidden />} {paused ? "Resume" : "Pause"}
        </button>
        <button type="button" disabled={!!busy} onClick={() => act("remove", {}, `Remove ${c.label} from KNOX? Their link and jobs stop for good. Files in your vault are kept.`)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] text-bad hover:underline disabled:opacity-40">
          <Trash size={14} aria-hidden /> Remove
        </button>
      </div>
    </li>
  );
}

export function Clients({ onChanged }: { onChanged: () => void }) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/station/clients", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(`KNOX answered ${res.status}`);
      setClients(((await res.json()) as { clients: Client[] }).clients);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const changed = () => {
    load();
    onChanged();
  };

  return (
    <div className="flex flex-col gap-3">
      {issued ? <IssuedLink issued={issued} onDone={() => setIssued(null)} /> : <AddClient onAdded={(i) => (setIssued(i), changed())} />}
      {error && <p className="text-[12px] text-bad" role="alert">Could not load clients: {error}</p>}
      {clients && !clients.length && <p className="text-[12px] text-muted">No clients added to KNOX yet. Add the first one above.</p>}
      {clients && clients.length > 0 && GROUPS.map((g) => {
        const mine = clients.filter((c) => g.ids.includes(c.category));
        // The catch-all heading only shows while someone is in it.
        if (!mine.length && g.ids.includes(undefined)) return null;
        return (
          <section key={g.title} aria-label={g.title} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1">
              <h2 className="text-[13px] uppercase" style={{ fontWeight: 500, letterSpacing: "0.06em" }}>KNOX {g.title} <span className="num text-muted">· {mine.length}</span></h2>
              <span className="text-[11.5px] text-muted">
                {g.ids.length > 1 ? g.ids.map((id) => `${catOf(id)!.label} ${mine.filter((c) => c.category === id).length}`).join(" · ") : g.note}
              </span>
            </div>
            {mine.length ? (
              <ul className="grid gap-3 lg:grid-cols-2">
                {[...mine].sort((a, b) => g.ids.indexOf(a.category) - g.ids.indexOf(b.category)).map((c) => <ClientCard key={c.id} c={c} onChange={changed} onIssued={setIssued} />)}
              </ul>
            ) : <p className="st-card px-3.5 py-3 text-[12px] text-muted">None yet. {g.note}</p>}
          </section>
        );
      })}
    </div>
  );
}
