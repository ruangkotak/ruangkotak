"use client";

import { useState } from "react";
import { alanBlanks, BRIEF_FILE_ACCEPT, BRIEF_FILE_MAX_MB, BRIEF_MAX, briefFileKind, joinPdfText, PROD_STAGES, type Production } from "@/lib/production";
import type { BrandJob } from "@/lib/station";

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/station/production", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? `KNOX answered ${res.status}`);
}

/** The text of a PDF brief, read in this browser: the file itself is never uploaded. pdf.js is loaded only when needed. */
async function pdfText(f: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdf.js runs its worker code on this page (briefs are small), so no separate worker file has to be served.
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error pdf.js ships no types for its worker module
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const pages: { str?: string; hasEOL?: boolean }[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      pages.push((await page.getTextContent()).items as { str?: string; hasEOL?: boolean }[]);
      if (pages.flat().reduce((a, i) => a + (i.str?.length ?? 0), 0) > BRIEF_MAX) break;
    }
    return joinPdfText(pages);
  } finally {
    await task.destroy();
  }
}

const btn = "min-h-[36px] rounded-[6px] border border-line px-2.5 text-[11.5px] hover:border-ink disabled:opacity-50";
const solid = "min-h-[36px] rounded-[6px] bg-[var(--mark)] px-2.5 text-[11.5px] text-[var(--on-solid)] disabled:opacity-50";

/** Brief → script + storyboard → client review link, all on the brand job. Everything is typed or pasted here. */
export function ProductionPanel({ clientId, job, p, onChange }: { clientId: string; job: BrandJob; p?: Production; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState(p?.brief ?? "");
  const [script, setScript] = useState(p?.script ?? "");
  const [storyboard, setStoryboard] = useState(p?.storyboard ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [seen, setSeen] = useState(p?.updatedAt);
  // A fresh script from the laptop replaces what the boxes show.
  if (p && p.updatedAt !== seen) {
    setSeen(p.updatedAt);
    setBrief(p.brief);
    setScript(p.script);
    setStoryboard(p.storyboard);
  }

  const act = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await call(body);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const [reading, setReading] = useState(false);
  const readFile = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    input.value = ""; // picking the same file again reads it again
    if (!f) return;
    const kind = briefFileKind(f.name, f.type);
    if (!kind) return setError("Pick a PDF or a text file (.pdf, .txt, .md). For a Word file, save it as PDF first.");
    if (f.size > BRIEF_FILE_MAX_MB * 1024 * 1024) return setError(`That file is over ${BRIEF_FILE_MAX_MB} MB. Paste the brief's text instead.`);
    setError(null);
    if (kind === "text") return setBrief((await f.text()).slice(0, BRIEF_MAX));
    setReading(true);
    try {
      const t = await pdfText(f);
      if (t.length < 20) return setError("This PDF has no text to read (it is probably a scan or a picture). Type or paste the key points instead.");
      setBrief(t);
    } catch (e) {
      const name = (e as { name?: string }).name;
      setError(name === "PasswordException" ? "This PDF is password-protected. Open it, copy the text and paste it here." : "Could not read this PDF. Open it, copy the text and paste it here.");
    } finally {
      setReading(false);
    }
  };

  const stage = p?.stage;
  const link = p?.token ? `${location.origin}/review?t=${p.token}` : "";
  const editable = stage === "review" || stage === "changes";
  const briefOpen = !stage || stage === "brief" || editable;
  const dirty = !!p && (script !== p.script || storyboard !== p.storyboard);
  const blanks = alanBlanks(`${script}\n${storyboard}`);

  return (
    <div className="rounded-[6px] border border-line">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-[36px] w-full items-center justify-between gap-2 px-2.5 text-left text-[11.5px]">
        <span>Brief &amp; script</span>
        <span className={`label rounded-full border px-2 py-0.5 ${stage === "approved" ? "border-[var(--good)] text-good" : stage && stage !== "writing" && stage !== "client" ? "border-[var(--mark)] !text-[var(--mark)]" : "border-line"}`}>{stage ? PROD_STAGES[stage] : "No brief yet"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2.5 border-t border-line px-2.5 py-2.5 text-[12px]">
          {p?.failed && <p className="text-bad">Last write failed: {p.failed}</p>}
          {stage === "changes" && p?.clientNote && <p className="rounded-[6px] border border-[var(--mark)] p-2"><span className="label">Client flagged</span><span className="mt-1 block whitespace-pre-wrap">{p.clientNote}</span></p>}
          {stage === "approved" && <p className="text-good">Approved by the client{p?.clientNote ? `: “${p.clientNote}”` : ""}. Record it.</p>}

          <label className="flex flex-col gap-1">
            <span>Brief <span className="text-muted">(paste the client&apos;s brief, or pick a PDF or .txt / .md file: check the text it pulls in)</span></span>
            <textarea className="field !min-h-[120px] text-[12px]" maxLength={20_000} disabled={!briefOpen} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Product, key specs, what they want shown, deadline, do's and don'ts…" />
          </label>
          {briefOpen && (
            <div className="flex flex-wrap items-center gap-1.5">
              <input type="file" accept={BRIEF_FILE_ACCEPT} disabled={reading} onChange={(e) => readFile(e.currentTarget)} className="max-w-[220px] text-[11px]" aria-label="Brief file (PDF or text)" />
              {reading && <span className="text-[11px] text-muted">Reading the PDF…</span>}
              {(!p || brief !== p.brief) && <button type="button" disabled={busy || brief.trim().length < 20} className={btn} onClick={() => act({ action: "brief", clientId, jobId: job.id, brief })}>Save brief</button>}
              <button type="button" disabled={busy || brief.trim().length < 20} className={solid}
                onClick={() => act({ action: "brief", clientId, jobId: job.id, brief, write: true }, p?.script ? "Write a new script? Your edits to the current one will be replaced." : undefined)}>
                {p?.script ? "Rewrite script" : "Write script"}
              </button>
            </div>
          )}
          {stage === "writing" && <p className="text-muted">Claude is writing on your laptop. It shows up here within about 10 minutes (the laptop must be awake).</p>}

          {p?.notes && (stage === "review" || stage === "changes") && (
            <details className="rounded-[6px] border border-line p-2" open={!p.token}>
              <summary className="cursor-pointer label">Notes for Alan · hook options (only you see this)</summary>
              <p className="mt-1.5 whitespace-pre-wrap text-[12px]">{p.notes}</p>
            </details>
          )}
          {(p?.script || editable) && (
            <>
              <label className="flex flex-col gap-1"><span>Script <span className="text-muted">(the client sees this)</span></span>
                <textarea className="field !min-h-[220px] font-mono text-[12px]" disabled={!editable} value={script} onChange={(e) => setScript(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">Storyboard
                <textarea className="field !min-h-[160px] font-mono text-[12px]" disabled={!editable} value={storyboard} onChange={(e) => setStoryboard(e.target.value)} />
              </label>
            </>
          )}

          {editable && blanks > 0 && <p className="text-[11.5px] text-[var(--mark)]">{blanks} blank{blanks === 1 ? "" : "s"} for you to fill after testing, like [ALAN&apos;S VERDICT AFTER TESTING]. [TO CONFIRM] lines are questions for the brand and can stay.</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            {editable && dirty && <button type="button" disabled={busy} className={btn} onClick={() => act({ action: "save", key: p!.key, script, storyboard })}>Save edits</button>}
            {editable && <button type="button" disabled={busy || dirty || !script.trim()} title={dirty ? "Save your edits first" : undefined} className={solid} onClick={() => act({ action: "send", key: p!.key }, blanks ? `${blanks} blank${blanks === 1 ? "" : "s"} for you ([ALAN'S …]) are still in the script or storyboard. The client will see them. Send anyway?` : undefined)}>{p?.token ? "Send to client again" : "Make client review link"}</button>}
            {(stage === "client" || stage === "approved") && <button type="button" disabled={busy} className={btn} onClick={() => act({ action: "reopen", key: p!.key }, stage === "approved" ? "Reopen an approved script? The client will need to approve it again." : "Take it back to edit? The client will see a 'being updated' note until you send it again.")}>{stage === "approved" ? "Reopen to edit" : "Take back to edit"}</button>}
            {p && <button type="button" disabled={busy} className="ml-auto min-h-[36px] px-1.5 text-[11.5px] text-bad hover:underline disabled:opacity-50" onClick={() => act({ action: "remove", key: p.key }, "Delete the brief, script and storyboard for this job? This cannot be undone.")}>Delete brief</button>}
          </div>

          {link && (stage === "client" || stage === "changes" || stage === "approved") && (
            <div className="flex flex-col gap-1.5 rounded-[6px] border border-line p-2">
              <span className="label">Client review link · you send it</span>
              <code className="break-all text-[11px]">{link}</code>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={btn} onClick={async () => { await navigator.clipboard?.writeText(`Hi! Here's the script and storyboard for ${job.what}. Please check the facts and specs and approve here: ${link}`).catch(() => {}); setCopied(true); }}>{copied ? "Copied" : "Copy message + link"}</button>
              </div>
              <span className="text-[11px] text-muted">The client can approve or flag a wrong fact. They cannot edit the script or your verdict. You get a Telegram alert when they answer.</span>
            </div>
          )}
          {error && <p className="text-bad" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
