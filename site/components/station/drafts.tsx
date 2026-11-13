"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Eye, X } from "@phosphor-icons/react";
import { DRAFT_PREVIEW_MAX, type DraftDecision, type DraftView } from "@/lib/station";

type Pending = Record<string, DraftDecision>;

const shortDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

/**
 * Content drafts waiting for review, owner view only. Preview reads the draft; Approve and Reject are remembered here and
 * your laptop rewrites the draft's **Status:** line within about 5 minutes. Nothing is posted from here.
 */
export function DraftReview({ onChanged }: { onChanged?: () => void }) {
  const [drafts, setDrafts] = useState<DraftView[] | null>(null);
  const [pending, setPending] = useState<Pending>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/station/drafts", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { drafts: DraftView[]; pending: Pending };
      setDrafts(data.drafts);
      setPending(data.pending);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 30_000);
    return () => clearInterval(poll);
  }, [load]);

  const decide = async (d: DraftView, decision: DraftDecision) => {
    const verb = decision === "approve" ? "Approve" : "Reject";
    const effect = decision === "approve"
      ? "It is marked APPROVED in the file. Nothing is posted: you still post it yourself."
      : "It is marked REJECTED in the file and leaves your review list. The file is kept.";
    if (!window.confirm(`${verb} this draft?\n\n${d.title}\n${d.file}\n\n${effect}`)) return;
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
  return (
    <section aria-labelledby="draft-review" className="st-card px-3.5 py-3">
      <h2 id="draft-review" className="text-[13px] uppercase" style={{ fontWeight: 500, letterSpacing: "0.06em" }}>
        KNOX Drafts to review · <span className="text-mark">{drafts.length}</span>
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {drafts.map((d) => {
          const waiting = pending[d.file];
          return (
            <li key={d.file} className="py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <div className="text-[13.5px] break-words">{d.title}</div>
                  <div className="mono mt-0.5 text-[11px] break-all text-muted">content/{d.file} · {shortDay(d.day)} · {d.status.toLowerCase()}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setOpen(open === d.file ? null : d.file)} aria-expanded={open === d.file}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-ink">
                    <Eye size={14} aria-hidden /> {open === d.file ? "Hide" : "Preview"}
                  </button>
                  <button type="button" disabled={busy !== null || !!waiting} onClick={() => decide(d, "approve")}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-ink disabled:opacity-50">
                    <Check size={14} aria-hidden /> Approve
                  </button>
                  <button type="button" disabled={busy !== null || !!waiting} onClick={() => decide(d, "reject")}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-bad hover:text-bad disabled:opacity-50">
                    <X size={14} aria-hidden /> Reject
                  </button>
                </div>
              </div>
              {waiting && <p className="mt-1.5 text-[11.5px] text-muted">{waiting === "approve" ? "Approved" : "Rejected"} here. Your laptop writes it into the file within about 5 minutes, while its jobs are running.</p>}
              {open === d.file && (
                <pre className="mono mt-2 max-h-[420px] overflow-auto rounded-[6px] border border-line p-3 text-[11.5px] leading-relaxed break-words whitespace-pre-wrap">{d.preview}{d.preview.length >= DRAFT_PREVIEW_MAX && "\n\n… preview stops here. Read the rest in the file before you approve."}</pre>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-[12px] text-bad" role="alert">{error}</p>}
      <p className="mt-2 border-t border-line pt-2 text-[11px] text-muted">Approve and Reject change the Status line of the draft on your laptop. They never post anything and never send anything to anyone. Read the draft first: brackets mean a result you only know after filming.</p>
    </section>
  );
}
