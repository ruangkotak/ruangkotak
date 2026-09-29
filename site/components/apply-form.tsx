"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { FUNNEL_LIVE } from "@/lib/funnel";
import { APPLY_CONSENT } from "@/lib/legal";
import { ConsentBox } from "./consent-box";

export function ApplyForm() {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error" | "consent">("idle");
  const [consent, setConsent] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (!String(data.handle).trim() || !String(data.contact).trim()) return setState("error");
    if (!consent) return setState("consent");
    setState("busy");
    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...data, consent }),
    }).catch(() => null);
    setState(res?.ok ? "sent" : "error");
  }

  return (
    <section id="monthly" className="mx-auto max-w-[1240px] px-4 py-24 md:px-8 md:py-32">
      <div className="grid gap-12 md:grid-cols-[1fr_1.2fr] md:gap-20">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Apply for monthly</h2>
          <p className="mt-4 max-w-[44ch] text-lg text-muted">
            Tell us about your account. We read every application and reply with a quote. No obligation.
          </p>
          <ol className="mt-10 grid gap-5">
            {[
              ["You apply", "Two minutes, below."],
              ["You get a quote", "Based on your account and goals."],
              ["Month one: the full report", "Then a re-check and an updated plan every month."],
            ].map(([h, b], i) => (
              <motion.li
                key={h}
                className="grid grid-cols-[2rem_1fr] gap-3"
                initial={{ opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <span className="grid size-8 place-items-center border border-ink num text-sm font-semibold">{i + 1}</span>
                <div>
                  <p className="font-semibold">{h}</p>
                  <p className="text-muted">{b}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>

        <AnimatePresence mode="wait">
          {state === "sent" ? (
            <motion.div key="sent" className="self-start border border-line bg-surface p-8" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} role="status">
              <CheckCircle size={36} weight="fill" className="text-good" />
              <p className="mt-4 text-2xl font-semibold tracking-tight">Application sent</p>
              <p className="mt-2 text-muted">We will reply on WhatsApp or email with a quote.</p>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2" noValidate exit={{ opacity: 0 }}>
              <Field label="Your name" name="name" autoComplete="name" />
              <Field label="Handle" name="handle" required placeholder="@yourhandle" />
              <div className="grid gap-2">
                <label htmlFor="apply-platform" className="text-sm font-medium">Platform</label>
                <select id="apply-platform" name="platform" className="field">
                  <option>TikTok</option>
                  <option>Instagram</option>
                  <option>Both</option>
                </select>
              </div>
              <Field label="Niche" name="niche" placeholder="Tech, food, beauty..." />
              <div className="grid gap-2 sm:col-span-2">
                <label htmlFor="apply-views" className="text-sm font-medium">Usual views per video</label>
                <select id="apply-views" name="views" className="field">
                  <option>Under 500</option>
                  <option>500 to 2,000</option>
                  <option>2,000 to 10,000</option>
                  <option>Over 10,000</option>
                </select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <label htmlFor="apply-goal" className="text-sm font-medium">What do you want from your account?</label>
                <textarea id="apply-goal" name="goal" className="field" placeholder="More views, brand deals, sell my own product..." />
              </div>
              <div className="sm:col-span-2">
                <Field label="WhatsApp number or email" name="contact" required />
              </div>
              <div className="sm:col-span-2">
                <ConsentBox
                  id="apply-consent"
                  text={APPLY_CONSENT}
                  checked={consent}
                  onChange={(v) => {
                    setConsent(v);
                    if (state === "consent") setState("idle");
                  }}
                  invalid={state === "consent"}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                <button className="btn-primary" disabled={!FUNNEL_LIVE || state === "busy"}>
                  {FUNNEL_LIVE ? "Send application" : "Work in progress"}
                </button>
                {state === "consent" && (
                  <p className="text-sm text-bad" role="alert">
                    Tick the consent box to send. / Tandakan kotak persetujuan untuk hantar.
                  </p>
                )}
                {state === "error" && (
                  <p className="text-sm text-bad" role="alert">
                    Add your handle and a WhatsApp number or email.
                  </p>
                )}
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function Field({ label, name, ...rest }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="grid gap-2">
      <label htmlFor={`apply-${name}`} className="text-sm font-medium">
        {label}
        {rest.required && <span className="text-muted"> (required)</span>}
      </label>
      <input id={`apply-${name}`} name={name} className="field" {...rest} />
    </div>
  );
}
