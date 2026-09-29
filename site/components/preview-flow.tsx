"use client";

import { ArrowRight, InstagramLogo, LockSimple, TiktokLogo, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Platform, Teaser } from "@/lib/types";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtX = (n: number) => `${n >= 10 ? Math.round(n) : n.toFixed(n >= 1 ? 1 : 2)}x`;
function deviceId() {
  try {
    let id = localStorage.getItem("rk_id");
    if (!id) localStorage.setItem("rk_id", (id = crypto.randomUUID()));
    return id;
  } catch {
    return "";
  }
}

type View = { k: "closed" } | { k: "loading"; handle: string } | { k: "teaser"; t: Teaser } | { k: "unavailable" };

export function PreviewFlow() {
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>({ k: "closed" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = handle.trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9._]{2,30}$/.test(clean)) {
      setError("Enter a handle like yourname, without spaces.");
      return;
    }
    setError("");
    setView({ k: "loading", handle: clean });
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform, handle: clean, deviceId: deviceId() }),
      });
      const data = await res.json();
      if (data.invalid) {
        setView({ k: "closed" });
        setError("That handle doesn't look right. Check the spelling.");
      } else setView(data.ok ? { k: "teaser", t: data.teaser } : { k: "unavailable" });
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
        <p id="handle-help" className={`mt-2 text-sm ${error ? "text-bad" : "text-muted"}`} role={error ? "alert" : undefined}>
          {error || "Public videos only. No password, no login."}
        </p>
      </form>

      <AnimatePresence>
        {view.k !== "closed" && (
          <Sheet onClose={() => setView({ k: "closed" })} busy={view.k === "loading"}>
            <AnimatePresence mode="wait" initial={false}>
              {view.k === "loading" && <Loading key="l" handle={view.handle} platform={label} />}
              {view.k === "teaser" && <TeaserView key="t" t={view.t} />}
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
        aria-label="Your account preview"
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

const STEPS = ["Finding the account", "Reading recent videos", "Sorting by content type", "Comparing best and weakest"];

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
      <p className="mt-4 text-sm text-muted">This takes a few seconds.</p>
    </motion.div>
  );
}

function Clip({ v, good }: { v: Teaser["best"]; good: boolean }) {
  return (
    <div className="flex gap-3">
      {v.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.cover} alt="" className="aspect-[9/16] w-14 shrink-0 object-cover" />
      ) : (
        <div className={`aspect-[9/16] w-14 shrink-0 ${good ? "bg-good-soft" : "bg-bad-soft"}`} />
      )}
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${good ? "text-good" : "text-bad"}`}>{good ? "Your best video" : "Your weakest video"}</p>
        <p className="mt-1 line-clamp-2 font-medium leading-snug">{v.title}</p>
        <p className="mt-1 text-sm text-muted">
          <span className="num">{fmt(v.views)}</span> views, <span className={`num ${good ? "text-good" : "text-bad"}`}>{fmtX(v.multiple)}</span> your usual
        </p>
      </div>
    </div>
  );
}

const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };

function TeaserView({ t }: { t: Teaser }) {
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/api/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportId: t.reportId, contact }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (data?.ok) router.push(data.url);
    else setState("error");
  }

  return (
    <motion.div initial="hidden" animate="show" exit={{ opacity: 0 }} transition={{ staggerChildren: 0.09 }}>
      <motion.p variants={item} className="text-sm text-muted">
        {t.handle} on {t.platform}
      </motion.p>
      <motion.h2 variants={item} className="mt-1 max-w-[26ch] text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
        <span className="num text-good">{t.fitRecent.hits}</span> of your last {t.fitRecent.of} videos are in content types that beat your
        usual views.
      </motion.h2>

      <motion.div variants={item} className="mt-6 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
        <Clip v={t.best} good />
        <Clip v={t.worst} good={false} />
      </motion.div>

      <motion.div variants={item} className="mt-5 border-t border-line pt-5">
        <p className="font-semibold">{t.finding.h}</p>
        <p className="mt-1 text-muted">{t.finding.b}</p>
      </motion.div>

      <motion.form variants={item} onSubmit={unlock} className="mt-6 bg-surface p-4 outline outline-1 outline-line md:p-5" noValidate>
        <p className="flex items-center gap-2 font-semibold">
          <LockSimple size={18} weight="bold" /> Your full mini-diagnosis is ready
        </p>
        <p className="mt-1 text-sm text-muted">Every content type ranked, what worked, what sank, and the one fix to start with.</p>
        <label htmlFor="contact" className="mt-4 mb-2 block text-sm font-medium">
          WhatsApp number or email
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="012 345 6789"
            autoComplete="email"
            className="field flex-1"
            aria-describedby="contact-help"
          />
          <button className="btn-primary" disabled={state === "busy"}>
            Unlock my report
          </button>
        </div>
        <p id="contact-help" className={`mt-2 text-sm ${state === "error" ? "text-bad" : "text-muted"}`} role={state === "error" ? "alert" : undefined}>
          {state === "error" ? "Check the number or email and try again." : "Used to send your report and follow up once. No spam."}
        </p>
      </motion.form>
    </motion.div>
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
