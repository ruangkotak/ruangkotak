"use client";

import { ArrowRight, InstagramLogo, TiktokLogo, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FUNNEL_LIVE } from "@/lib/funnel";
import { CONSENT } from "@/lib/legal";
import { ConsentBox } from "./consent-box";
import type { Platform } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9\s-]{9,15}$/;
function deviceId() {
  try {
    let id = localStorage.getItem("rk_id");
    if (!id) localStorage.setItem("rk_id", (id = crypto.randomUUID()));
    return id;
  } catch {
    return "";
  }
}

type View = { k: "closed" } | { k: "details"; handle: string } | { k: "loading"; handle: string } | { k: "unavailable" };
type Details = { name: string; email: string; whatsapp: string; consentNotice: boolean; consentOwner: boolean; consentMarketing: boolean };
type DetailError = "name" | "email" | "whatsapp" | "consent";
const EMPTY: Details = { name: "", email: "", whatsapp: "", consentNotice: false, consentOwner: false, consentMarketing: false };
const DETAIL_ERRORS: Record<DetailError, string> = {
  name: "Add your name so we know who to send it to.",
  email: "Check the email address and try again.",
  whatsapp: "Check the WhatsApp number, or leave it empty.",
  consent: "Tick both required boxes to continue. / Tandakan kedua-dua kotak wajib untuk teruskan.",
};

export function PreviewFlow() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [soon, setSoon] = useState(false);
  const [view, setView] = useState<View>({ k: "closed" });
  const [details, setDetails] = useState<Details>(EMPTY);
  const [detailError, setDetailError] = useState<DetailError | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = handle.trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9._]{2,30}$/.test(clean)) {
      setError("Enter a handle like yourname, without spaces.");
      return;
    }
    setError("");
    if (!FUNNEL_LIVE) return setSoon(true);
    setDetailError(null);
    setView({ k: "details", handle: clean });
  }

  // Contact details go with the handle in one request; the server scrapes only after they check out.
  async function run(clean: string) {
    const d = { ...details, name: details.name.trim(), email: details.email.trim(), whatsapp: details.whatsapp.trim() };
    const bad: DetailError | null = !d.name
      ? "name"
      : !EMAIL.test(d.email)
        ? "email"
        : d.whatsapp && !PHONE.test(d.whatsapp)
          ? "whatsapp"
          : !d.consentNotice || !d.consentOwner
            ? "consent"
            : null;
    if (bad) return setDetailError(bad);
    setDetailError(null);
    setView({ k: "loading", handle: clean });
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform, handle: clean, deviceId: deviceId(), ...d }),
      });
      const data = await res.json();
      if (data.invalid === "handle") {
        setView({ k: "closed" });
        setError("That handle doesn't look right. Check the spelling.");
      } else if (data.invalid) {
        setDetailError(data.invalid);
        setView({ k: "details", handle: clean });
      } else if (data.ok) router.push(data.url);
      else setView({ k: "unavailable" });
    } catch {
      setView({ k: "unavailable" });
    }
  }

  const label = platform === "tiktok" ? "TikTok" : "Instagram";

  return (
    <>
      <form onSubmit={submit} className="rise mt-8 max-w-[540px]" style={{ "--d": "0.25s" } as React.CSSProperties} noValidate>
        <fieldset className="flex w-fit border border-line p-1" role="radiogroup" aria-label="Platform">
          {(["tiktok", "instagram"] as const).map((p) => (
            <label key={p} className="relative cursor-pointer px-4 py-2 text-sm font-medium">
              <input
                type="radio"
                name="platform"
                value={p}
                checked={platform === p}
                onChange={() => setPlatform(p)}
                className="peer sr-only"
              />
              {platform === p && (
                <motion.span layoutId="platform-pill" className="absolute inset-0 bg-ink" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
              )}
              <span
                className={`relative flex items-center gap-2 transition-colors ${platform === p ? "text-bg" : "text-muted"} peer-focus-visible:underline`}
              >
                {p === "tiktok" ? <TiktokLogo size={16} weight="bold" /> : <InstagramLogo size={16} weight="bold" />}
                {p === "tiktok" ? "TikTok" : "Instagram"}
              </span>
            </label>
          ))}
        </fieldset>

        <label htmlFor="handle" className="mt-5 mb-2 block text-sm font-medium">
          Your {label} handle
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">@</span>
            <input
              id="handle"
              name="handle"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              aria-describedby="handle-help"
              aria-invalid={!!error}
              placeholder="yourhandle"
              className="field !pl-8"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={view.k === "loading"}>
            Check my account <ArrowRight size={18} weight="bold" />
          </button>
        </div>
        <p
          id="handle-help"
          className={`mt-2 text-sm ${error ? "text-bad" : soon ? "font-medium text-good" : "text-muted"}`}
          role={error ? "alert" : soon ? "status" : undefined}
        >
          {error || (soon ? "Work in progress: free previews open soon." : "Public videos only. No password, no login.")}
        </p>
      </form>

      <AnimatePresence>
        {view.k !== "closed" && (
          <Sheet onClose={() => setView({ k: "closed" })} busy={view.k === "loading"}>
            <AnimatePresence mode="wait" initial={false}>
              {view.k === "loading" && <Loading key="l" handle={view.handle} platform={label} />}
              {view.k === "details" && (
                <DetailsForm
                  key="d"
                  handle={view.handle}
                  platform={label}
                  value={details}
                  onChange={(d) => {
                    setDetails(d);
                    setDetailError(null);
                  }}
                  error={detailError}
                  onSubmit={() => run(view.handle)}
                />
              )}
              {view.k === "unavailable" && <Unavailable key="u" onClose={() => setView({ k: "closed" })} />}
            </AnimatePresence>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  );
}

function Sheet({ children, onClose, busy }: { children: React.ReactNode; onClose: () => void; busy: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Lock scroll and move focus only when the sheet opens, not on every parent render.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-ink/40" onClick={busy ? undefined : onClose} aria-hidden />
      <motion.div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Your mini-diagnosis"
        className="relative max-h-[92dvh] w-full max-w-[760px] overflow-y-auto border border-line bg-bg p-5 outline-none md:p-8"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
      >
        {!busy && (
          <button onClick={onClose} className="absolute right-3 top-3 p-2 text-muted hover:text-ink" aria-label="Close">
            <X size={20} />
          </button>
        )}
        {children}
      </motion.div>
    </motion.div>
  );
}

const STEPS = ["Finding the account", "Reading recent videos", "Sorting by content type", "Comparing best and weakest", "Writing your mini-diagnosis"];

function Loading({ handle, platform }: { handle: string; platform: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1100);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-live="polite">
      <p className="text-sm text-muted">
        @{handle} on {platform}
      </p>
      <div className="mt-2 h-8 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p key={step} className="text-2xl font-semibold tracking-tight" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -24, opacity: 0 }}>
            {STEPS[step]}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mt-6 grid grid-cols-20 gap-[3px]" aria-hidden>
        {Array.from({ length: 40 }, (_, i) => (
          <motion.div
            key={i}
            className="aspect-square bg-line"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: ((i % 10) + Math.floor(i / 10)) * 0.07 }}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">This can take up to a minute. Keep this page open.</p>
    </motion.div>
  );
}

function DetailsForm({
  handle,
  platform,
  value,
  onChange,
  error,
  onSubmit,
}: {
  handle: string;
  platform: string;
  value: Details;
  onChange: (d: Details) => void;
  error: DetailError | null;
  onSubmit: () => void;
}) {
  const field = (k: "name" | "email" | "whatsapp", label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`lead-${k}`} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <input
        id={`lead-${k}`}
        name={k}
        value={value[k]}
        onChange={(e) => onChange({ ...value, [k]: e.target.value })}
        aria-invalid={error === k}
        aria-describedby={error === k ? "lead-error" : undefined}
        className="field w-full"
        {...props}
      />
    </div>
  );

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <p className="text-sm text-muted">
        @{handle} on {platform}
      </p>
      <h2 className="mt-1 max-w-[26ch] text-2xl font-semibold leading-tight tracking-tight md:text-3xl">Where should we send your <span className="whitespace-nowrap">mini-diagnosis?</span></h2>
      <p className="mt-2 text-muted">It opens on screen right away, and a copy goes to your email.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {field("name", "Your name", { autoComplete: "name", placeholder: "e.g. Aina" })}
        {field("email", "Email", { type: "email", autoComplete: "email", inputMode: "email", autoCapitalize: "none", spellCheck: false, placeholder: "you@email.com" })}
        <div className="sm:col-span-2">
          {field("whatsapp", "WhatsApp (optional)", { type: "tel", autoComplete: "tel", inputMode: "tel", placeholder: "012 345 6789" })}
        </div>
      </div>

      <fieldset className="mt-6 grid gap-4 border-t border-line pt-5">
        <legend className="sr-only">Consent / Persetujuan</legend>
        <ConsentBox
          id="consent-notice"
          text={CONSENT.notice}
          checked={value.consentNotice}
          onChange={(v) => onChange({ ...value, consentNotice: v })}
          invalid={error === "consent" && !value.consentNotice}
        />
        <ConsentBox
          id="consent-owner"
          text={CONSENT.owner}
          checked={value.consentOwner}
          onChange={(v) => onChange({ ...value, consentOwner: v })}
          invalid={error === "consent" && !value.consentOwner}
        />
        <ConsentBox
          id="consent-marketing"
          text={CONSENT.marketing}
          checked={value.consentMarketing}
          onChange={(v) => onChange({ ...value, consentMarketing: v })}
        />
      </fieldset>

      {error && (
        <p id="lead-error" role="alert" className="mt-3 text-sm text-bad">
          {DETAIL_ERRORS[error]}
        </p>
      )}

      <button type="submit" className="btn-primary mt-6 w-full sm:w-auto">
        Show my mini-diagnosis <ArrowRight size={18} weight="bold" />
      </button>
    </motion.form>
  );
}

function Unavailable({ onClose }: { onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alert">
      <h2 className="text-2xl font-semibold tracking-tight">Preview unavailable right now</h2>
      <p className="mt-2 text-muted">Please try again later.</p>
      <button onClick={onClose} className="btn-ghost mt-6">
        Close
      </button>
    </motion.div>
  );
}
