"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { ONBOARD_CONSENT } from "@/lib/legal";
import { DEAL_TYPES, RATE_CARD_FEE, type DealType } from "@/lib/deals";
import { ConsentBox } from "./consent-box";

// The public brand form. It only files a request: Alan reads it on his board and replies himself.
export function OnboardingForm() {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [deal, setDeal] = useState<DealType | "">("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (!deal) return setError("Pick the kind of job.");
    if (!consent) return setError("Tick the consent box to send.");
    setState("busy");
    setError(null);
    const res = await fetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, deal, consent }) }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (res?.ok && out?.ok) return setState("sent");
    setState("idle");
    setError(out?.error ?? "That didn't go through. Please try again.");
  }

  if (state === "sent")
    return (
      <div className="self-start rounded-lg border border-line bg-surface p-8" role="status">
        <CheckCircle size={36} weight="fill" className="text-good" />
        <p className="mt-4 text-2xl font-semibold tracking-tight">Got it, thanks!</p>
        <p className="mt-2 text-muted">I'll read it myself and reply on WhatsApp or email with the fee and next steps.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2" noValidate>
      <Field label="Brand" name="brand" required placeholder="Brand name" autoComplete="organization" />
      <Field label="Your name" name="name" autoComplete="name" />
      <Field label="WhatsApp or email" name="reach" required autoComplete="email" />
      <Field label="Brand Instagram" name="instagram" placeholder="@brand" autoCapitalize="none" spellCheck={false} />
      <fieldset className="grid gap-2 sm:col-span-2">
        <legend className="text-sm font-medium">What kind of job? <span className="text-muted">(required)</span></legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DEAL_TYPES.map((d) => (
            <label key={d.id} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${deal === d.id ? "border-ink" : "border-line"}`}>
              <input type="radio" name="deal-pick" value={d.id} checked={deal === d.id} onChange={() => setDeal(d.id)} className="accent-good" />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <Field label="Product or job" name="what" required placeholder="e.g. new wireless mic review" />
      </div>
      <div className="grid gap-2">
        <label htmlFor="onboard-offer" className="text-sm font-medium">Fee you have in mind (RM)</label>
        <input id="onboard-offer" name="offer" type="number" min={0} step="any" inputMode="decimal" className="field" placeholder={String(RATE_CARD_FEE)} />
        <p className="text-xs text-muted">My rate: RM{RATE_CARD_FEE} + review unit, one video on Instagram &amp; TikTok.</p>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <label htmlFor="onboard-notes" className="text-sm font-medium">Anything else?</label>
        <textarea id="onboard-notes" name="notes" maxLength={500} className="field" placeholder="Timeline, launch date, key points..." />
      </div>
      {/* Left empty by people; bots fill it. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="onboard-website">Website</label>
        <input id="onboard-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="sm:col-span-2">
        <ConsentBox id="onboard-consent" text={ONBOARD_CONSENT} checked={consent} onChange={(v) => { setConsent(v); setError(null); }} invalid={!!error && !consent} />
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button className="btn-primary" disabled={state === "busy"}>{state === "busy" ? "Sending..." : "Send job offer"}</button>
        {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      </div>
    </form>
  );
}

function Field({ label, name, ...rest }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="grid gap-2">
      <label htmlFor={`onboard-${name}`} className="text-sm font-medium">
        {label}
        {rest.required && <span className="text-muted"> (required)</span>}
      </label>
      <input id={`onboard-${name}`} name={name} className="field" {...rest} />
    </div>
  );
}
