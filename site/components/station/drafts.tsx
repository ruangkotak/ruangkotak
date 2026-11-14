"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X } from "@phosphor-icons/react";
import { DRAFT_PREVIEW_MAX, type DraftDecision, type DraftView } from "@/lib/station";

type Pending = Record<string, DraftDecision>;

const shortDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

/**
 * Content drafts waiting for review, owner view only, one card each like the Needs me items. "Show the draft" reads it;
 * Approve and Reject are remembered here and your laptop rewrites the draft's **Status:** line within about 5 minutes.
 * Nothing is posted from here.
 */
export function DraftReview({ onChanged, onAgentDrafts }: { onChanged?: () => void; onAgentDrafts?: (n: number) => void }) {
  const [drafts, setDrafts] = useState<DraftView[] | null>(null);
  const [pending, setPending] = useState<Pending>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/station/drafts", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { drafts: DraftView[]; pending: Pending };
      setDrafts(data.drafts);
      setPending(data.pending);
      onAgentDrafts?.(data.drafts.filter((d) => d.kind === "agent").length);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // Nothing to refresh while the tab is in the background.
    const poll = setInterval(() => !document.hidden && load(), 30_000);
    return () => clearInterval(poll);
  }, [load]);

  const decide = async (d: DraftView, decision: DraftDecision) => {
    const verb = decision === "approve" ? "Approve" : "Reject";
    const effect = d.kind === "agent"
      ? decision === "approve"
        ? "It is ticked as approved in your notes and the ask is closed. Nothing is sent to anyone: the draft is for you to use."
        : "It is ticked as rejected in your notes and the ask is closed. The draft file is kept. Ask again with more detail if you want another go."
      : decision === "approve"
        ? "It is marked APPROVED in the file. Nothing is posted: you still post it yourself."
        : "It is marked REJECTED in the file and leaves your review list. The file is kept.";
    if (!window.confirm(`${verb} this draft?\n\n${d.title}\n${d.where ?? d.file}\n\n${effect}`)) return;
    setBusy(d.file);
    setError(null);
    try {
      const res = await fetch("/api/station/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file: d.file, decision }), credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setError(data.error ?? `KNOX answered ${res.status}`);
      else {
        await load();
        onChanged?.();
      }
    } catch {
      setError("Could not reach KNOX. Nothing was changed.");
    }
    setBusy(null);
  };

  if (!drafts?.length) return null;
  const allOpen = drafts.every((d) => open.has(d.file));
  const toggle = (file: string) => setOpen((o) => { const n = new Set(o); n.has(file) ? n.delete(file) : n.add(file); return n; });
  return (
    <section aria-label="Drafts to review" className="flex flex-col gap-2">
      {drafts.length > 1 && (
        <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(drafts.map((d) => d.file)))} className="self-start px-1 text-[12px] text-muted underline underline-offset-2 hover:text-ink">
          {allOpen ? "Close all drafts" : "Open all drafts"}
        </button>
      )}
      <ul className="flex flex-col gap-2">
        {drafts.map((d) => {
          const waiting = pending[d.file];
          const shown = open.has(d.file);
          return (
            <li key={d.file} className="st-card px-3.5 py-3">
              <div className="mono text-[10.5px] uppercase" style={{ letterSpacing: "0.08em" }}>
                <span className="text-mark">Make</span>
                <span className="text-muted"> · {d.client || "RUANGKOTAK"} · {d.kind === "agent" ? "agent draft for your ask" : "draft to review"}</span>
              </div>
              <div className="mt-1 text-[14.5px] break-words" style={{ fontWeight: 500 }}>{d.title}</div>
              <div className="mono mt-0.5 text-[11px] break-all text-muted">{d.kind === "agent" ? d.where : `content/${d.file}`} · {shortDay(d.day)} · {d.status.toLowerCase()}</div>
              <button type="button" onClick={() => toggle(d.file)} aria-expanded={shown} className="mt-1.5 text-[12px] text-muted hover:text-ink">
                {shown ? "▾ Hide the draft" : "▸ Show the draft"}
              </button>
              {shown && (
                <pre className="mono mt-2 max-h-[420px] overflow-auto rounded-[6px] border border-line p-3 text-[11.5px] leading-relaxed break-words whitespace-pre-wrap">
                  {d.preview}{d.preview.length >= DRAFT_PREVIEW_MAX && "\n\n… preview stops here. Read the rest in the file before you approve."}
                </pre>
              )}
              {waiting ? (
                <p className="mt-2.5 text-[12px] text-muted">{waiting === "approve" ? "Approved" : "Rejected"} here. Your laptop writes it into {d.kind === "agent" ? "your notes" : "the file"} within about 5 minutes, while its jobs are running.</p>
              ) : (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => decide(d, "approve")}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] bg-[var(--mark)] px-4 text-[13px] text-on-solid hover:brightness-95 disabled:opacity-50" style={{ fontWeight: 600 }}>
                    <Check size={14} aria-hidden /> Approve
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => decide(d, "reject")}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3.5 text-[13px] text-bad hover:border-bad disabled:opacity-50">
                    <X size={14} aria-hidden /> Reject
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-[12px] text-bad" role="alert">{error}</p>}
      <p className="px-1 text-[11px] text-muted">Approve and Reject are written on your laptop: the Status line of a post, or a tick beside an agent draft and its ask. They never post anything and never send anything to anyone. Read the draft first: brackets mean a result you only know after filming, and the verdict on a product is yours to write.</p>
    </section>
  );
}
