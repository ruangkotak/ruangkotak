"use client";

import { Link, PaperPlaneTilt, TelegramLogo } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type Reply = { ok?: boolean; error?: string; connected?: boolean; problem?: string };
const post = async (action: string): Promise<Reply> => {
  const res = await fetch("/api/station/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }), credentials: "same-origin" }).catch(() => null);
  return ((await res?.json().catch(() => ({}))) as Reply | undefined) ?? { error: "Could not reach KNOX." };
};

/** Health tab (owner): whether Telegram alerts are on, a button to prove it, and the link that lets you type to KNOX from Telegram. */
export function TelegramPanel({ on }: { on: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");
  const [link, setLink] = useState<"checking" | "on" | "off" | "working">("checking");
  const [linkNote, setLinkNote] = useState("");

  useEffect(() => {
    if (!on) return;
    let live = true;
    post("status").then((r) => live && (setLink(r.connected ? "on" : "off"), setLinkNote(r.ok ? r.problem ?? "" : r.error ?? "")));
    return () => { live = false; };
  }, [on]);

  const connect = async () => {
    setLink("working");
    const r = await post("connect");
    setLink(r.connected ? "on" : "off");
    setLinkNote(r.ok ? r.problem ?? "" : r.error ?? "Could not connect.");
  };
  const button = "inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-ink disabled:opacity-50";

  return (
    <section className="st-card flex flex-col gap-3 px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              const data = await post("test");
              setState(data.ok ? "sent" : data.error ?? "Could not reach KNOX.");
            }}
            className={button}
          >
            <PaperPlaneTilt size={14} aria-hidden /> {state === "sending" ? "Sending…" : "Send test alert"}
          </button>
        )}
      </div>

      {on && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="flex items-start gap-2.5">
            <Link size={20} className={link === "on" ? "text-good" : "text-muted"} aria-hidden />
            <div>
              <h2 className="text-[13px]" style={{ fontWeight: 500 }}>Typing to KNOX from Telegram {link === "on" ? "connected" : link === "checking" ? "…" : "not connected"}</h2>
              <p className="text-[12px] text-muted">
                {link === "on"
                  ? 'Message the bot "needs", "today", "money" or "report" for an answer. Anything else you type becomes an ask: your laptop collects it within 15 minutes and the draft shows on Needs me. Only your own chat is listened to.'
                  : "Connect once and the same bot will also listen to you. Nothing is sent to anyone but you."}
              </p>
              {linkNote && <p className="mt-1 text-[12px] text-bad" role="status">{linkNote}</p>}
            </div>
          </div>
          <button type="button" disabled={link === "checking" || link === "working"} onClick={connect} className={button}>
            <Link size={14} aria-hidden /> {link === "working" ? "Connecting…" : link === "on" ? "Reconnect" : "Connect typing"}
          </button>
        </div>
      )}
    </section>
  );
}
