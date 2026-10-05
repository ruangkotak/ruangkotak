"use client";

import { useState } from "react";
import { FUNNEL_LIVE } from "@/lib/funnel";

// Live demo on the landing page: one caption, read with the same TypeSafe questions a report uses (/api/caption).
// The result box keeps a fixed height so the pinned GSAP sections below never shift.

type Result = { label: string; def: string; sure: "clear" | "likely" | "mixed"; reason: number };
type State = { k: "idle" | "busy" | "short" | "limited" | "error" } | { k: "done"; r: Result };

const EXAMPLES = ["3 sebab phone ni paling berbaloi bawah RM1000", "Unboxing earbuds baru", "Jangan beli powerbank ni sebelum tengok video ni"];
const SURE = { clear: "Clear read", likely: "Likely", mixed: "Mixed signals" };

export function CaptionCheck() {
  const [text, setText] = useState("");
  const [s, setS] = useState<State>({ k: "idle" });

  async function read(caption: string) {
    if (!FUNNEL_LIVE) return;
    if (caption.trim().length < 3) return setS({ k: "short" });
    setS({ k: "busy" });
    const res = await fetch("/api/caption", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caption }),
    }).catch(() => null);
    const j = await res?.json().catch(() => null);
    if (res?.ok && j?.ok) setS({ k: "done", r: j });
    else setS({ k: res?.status === 429 ? "limited" : res?.status === 400 ? "short" : "error" });
  }

  const reasonYes = s.k === "done" && s.r.reason >= 0.5;
  return (
    <section className="blk" id="try">
      <div className="wrap try">
        <div>
          <span className="eb">Try it · live</span>
          <h2 className="serif">Paste one caption.</h2>
          <p>
            Every report reads your captions this way: what the video does for the viewer, and whether the caption gives a
            reason to keep watching. Try one of yours, in Malay, English or both.
          </p>
        </div>
        <form
          className="try-card"
          onSubmit={(e) => {
            e.preventDefault();
            read(text);
          }}
        >
          <label htmlFor="try-cap" className="try-lbl">
            Caption
          </label>
          <textarea
            id="try-cap"
            rows={3}
            maxLength={400}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="3 sebab phone ni paling berbaloi bawah RM1000"
            disabled={!FUNNEL_LIVE}
          />
          <div className="try-ex">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={!FUNNEL_LIVE || s.k === "busy"}
                onClick={() => {
                  setText(ex);
                  read(ex);
                }}
              >
                {ex}
              </button>
            ))}
          </div>
          <button className="btn btn-fill" type="submit" disabled={!FUNNEL_LIVE || s.k === "busy"}>
            {!FUNNEL_LIVE ? "Work in progress" : s.k === "busy" ? "Reading…" : "Read caption"} <span className="arr">→</span>
          </button>
          <div className="try-out" aria-live="polite">
            {s.k === "done" ? (
              <>
                <div className="try-row">
                  <small>Content type · {SURE[s.r.sure]}</small>
                  <b className="serif">{s.r.label}</b>
                  <p>{s.r.def}</p>
                </div>
                <div className="try-row">
                  <small>Reason to keep watching</small>
                  <div className="try-meter">
                    <i style={{ width: `${Math.round(s.r.reason * 100)}%` }} className={reasonYes ? "y" : ""} />
                  </div>
                  <p>
                    {reasonYes
                      ? "Yes. The caption promises a benefit, a problem, a question or a claim."
                      : "Not yet. It mostly names the topic. Add the benefit or the problem it solves."}
                  </p>
                </div>
              </>
            ) : (
              <p className="try-hint">
                {s.k === "busy"
                  ? "Reading the caption…"
                  : s.k === "short"
                    ? "Type a few more words first."
                    : s.k === "limited"
                      ? "That’s a lot of captions. Try again in an hour, or get the free diagnosis."
                      : s.k === "error"
                        ? "Couldn’t read that one just now. Try again in a moment."
                        : "Pick an example or paste your own. Only the caption is read; nothing is saved."}
              </p>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
