"use client";

import { PaperPlaneTilt, TelegramLogo } from "@phosphor-icons/react";
import { useState } from "react";

/** Alerts tab: whether Telegram alerts are on, and a button to prove it. */
export function TelegramPanel({ on }: { on: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");
  return (
    <section className="st-card flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <TelegramLogo size={20} weight={on ? "fill" : "regular"} className={on ? "text-good" : "text-muted"} aria-hidden />
        <div>
          <h2 className="text-[13px]" style={{ fontWeight: 500 }}>KNOX Telegram alerts {on ? "on" : "off"}</h2>
          <p className="text-[12px] text-muted">
            {on
              ? "One message when something new needs you, and when it clears. A closed laptop only alerts after 12 hours; a slow site only when it is down."
              : "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Vercel (the same bot as your application alerts)."}
          </p>
          {state !== "idle" && state !== "sending" && (
            <p className={`mt-1 text-[12px] ${state === "sent" ? "text-good" : "text-bad"}`} role="status">{state === "sent" ? "Test sent. Check Telegram." : state}</p>
          )}
        </div>
      </div>
      {on && (
        <button
          type="button"
          disabled={state === "sending"}
          onClick={async () => {
            setState("sending");
            const res = await fetch("/api/station/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "test" }), credentials: "same-origin" }).catch(() => null);
            const data = (await res?.json().catch(() => ({}))) as { ok?: boolean; error?: string } | undefined;
            setState(data?.ok ? "sent" : data?.error ?? "Could not reach KNOX.");
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-ink disabled:opacity-50"
        >
          <PaperPlaneTilt size={14} aria-hidden /> {state === "sending" ? "Sending…" : "Send test alert"}
        </button>
      )}
    </section>
  );
}
