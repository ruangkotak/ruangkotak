"use client";

import { useEffect, useState } from "react";
import type { ClientProdView } from "@/lib/production";

/** The script and storyboard for the brand, with Approve or Flag a fact. Opinions are not open for edits. */
export function ReviewForm({ token }: { token: string }) {
  const [view, setView] = useState<ClientProdView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return setError("This review link is not valid.");
    fetch(`/api/review?t=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "This review link is not valid.");
        setView(d as ClientProdView);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function reply(decision: "approve" | "changes") {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, decision, note }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error ?? "Nothing was saved. Try again.");
      setView(d.view);
      setFlagging(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <p className="text-muted">{error ?? "Loading the script…"}</p>;
  return (
    <div>
      <p className="eyebrow">Script review · {view.brand}</p>
      <h1 className="mt-4 text-3xl md:text-5xl">{view.what}</h1>
      {view.state === "closed" ? (
        <p className="mt-8 text-muted">Alan is updating this script. You will get the link again when it is ready.</p>
      ) : (
        <>
          <p className="mt-5 max-w-[60ch] text-sm text-muted">
            Please check the facts and specs: product names, numbers, prices, features. The opinion and the verdict are Alan&apos;s own, from testing the product, and are not open for edits.
          </p>
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Script</h2>
            <div className="mt-3 whitespace-pre-wrap border border-line p-4 text-[15px] leading-relaxed">{view.script}</div>
          </section>
          {view.storyboard && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">Storyboard</h2>
              <div className="mt-3 whitespace-pre-wrap border border-line p-4 text-[15px] leading-relaxed">{view.storyboard}</div>
            </section>
          )}
          <section className="mt-10 border-t border-line pt-6" aria-live="polite">
            {view.state === "approved" ? (
              <p className="font-semibold">Approved. Thank you. Alan will record it and send you the final video to check.</p>
            ) : view.state === "changes" ? (
              <p>
                <span className="font-semibold">Thanks, your note is with Alan.</span>
                <span className="mt-2 block whitespace-pre-wrap text-sm text-muted">{view.note}</span>
              </p>
            ) : flagging ? (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-2 text-sm">Which fact or spec is wrong, and what is right?
                  <textarea className="field" rows={5} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Battery life is 7 hours, not 6." />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || note.trim().length < 3} onClick={() => reply("changes")} className="btn-primary">Send to Alan</button>
                  <button type="button" disabled={busy} onClick={() => setFlagging(false)} className="btn-ghost">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => reply("approve")} className="btn-primary">Approve the script</button>
                <button type="button" disabled={busy} onClick={() => setFlagging(true)} className="btn-ghost">Flag a wrong fact</button>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-bad">{error}</p>}
          </section>
        </>
      )}
    </div>
  );
}
