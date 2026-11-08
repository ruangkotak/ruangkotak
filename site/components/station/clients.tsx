"use client";

import { ArrowsClockwise, Check, CheckCircle, Circle, Copy, Eye, PauseCircle, PlayCircle, Trash, UserPlus } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import type { ClientRecord, OnboardingStep } from "@/lib/station";

type Client = Omit<ClientRecord, "keyHash"> & { steps: OnboardingStep[] };
type Issued = { id: string; label: string; key: string; fresh: boolean };

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }) : "");
const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 31).replace(/-+$/, "");

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/station/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; key?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? `Station answered ${res.status}`);
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
  const message = `Hi ${issued.label}, here is your private RUANGKOTAK Station link: ${link}\n\nIt shows your content jobs and what is waiting in final review, updated through the day. Please keep it to yourself: anyone with the link can see your page.`;
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
          const r = await call({ action: "create", label, instagram, slug: shown });
          onAdded({ id: shown, label: label.trim(), key: r.key!, fresh: true });
          setLabel("");
          setInstagram("");
          setSlug("");
          setSlugEdited(false);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="flex items-center gap-2 text-[13px]" style={{ fontWeight: 500 }}><UserPlus size={16} aria-hidden /> Add a client</h2>
      <p className="mt-1 text-[12px] text-muted">
        They get a private link to their own page: their content jobs and what is waiting in final review. Their reel velocity
        and final-review jobs start on your laptop by themselves; no deploy, no settings to change.
      </p>
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
      <button type="submit" disabled={busy || label.trim().length < 2} className="mt-3 inline-flex min-h-[42px] items-center gap-2 rounded-[6px] bg-[var(--mark)] px-4 text-[13px] text-[var(--on-solid)] disabled:opacity-50">
        {busy ? "Setting up…" : "Add client and make their link"}
      </button>
    </form>
  );
}

function ClientCard({ c, onChange, onIssued }: { c: Client; onChange: () => void; onIssued: (i: Issued) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState(c.instagram ?? "");
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

  return (
    <li className="st-card px-3.5 py-3" style={paused ? { opacity: 0.7 } : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[14px]">{c.label}</div>
          <div className="text-[11.5px] text-muted">
            <span className="mono">{c.id}</span>{c.instagram ? ` · @${c.instagram}` : ""} · added {day(c.createdAt)}
            {c.lastSeenAt ? ` · last opened ${day(c.lastSeenAt)}` : ""}
          </div>
        </div>
        <span className={`label rounded-full border px-2 py-1 ${paused ? "border-line" : "border-[var(--good)] text-good"}`}>{paused ? "paused" : `${done}/${c.steps.length} set up`}</span>
      </div>

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
        <button type="button" disabled={!!busy} onClick={() => act("remove", {}, `Remove ${c.label} from Station? Their link and jobs stop for good. Files in your vault are kept.`)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] text-bad hover:underline disabled:opacity-40">
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
      if (!res.ok) throw new Error(`Station answered ${res.status}`);
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
      {clients && !clients.length && <p className="text-[12px] text-muted">No clients added from Station yet. Clients set up in the registry file (like Client demo) are not listed here.</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {clients?.map((c) => <ClientCard key={c.id} c={c} onChange={changed} onIssued={setIssued} />)}
      </ul>
    </div>
  );
}
