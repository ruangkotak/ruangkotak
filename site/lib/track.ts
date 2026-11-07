// Aggregate funnel counters: one number per step per day (Malaysia time), no personal data.
// Read them with `node --experimental-strip-types scripts/funnel-counts.ts`.
// Counters never break a request: a Redis hiccup is logged and swallowed.
import { store } from "./store";

export const STEPS = ["home_view", "preview_started", "preview_completed", "report_viewed", "apply_submitted"] as const;
export type Step = (typeof STEPS)[number];

const KEEP = 90 * 24 * 60 * 60;
export const myDay = (d = new Date()) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

export async function track(step: Step) {
  try {
    await store.hit(`fn:${step}:${myDay()}`, KEEP);
  } catch (err) {
    console.error("[track]", step, err);
  }
}

// Daily totals for the last `days` days (oldest first), one column per step. Read-only.
export async function dailyCounts(days: number) {
  const list = Array.from({ length: days }, (_, i) => myDay(new Date(Date.now() - i * 86400_000))).reverse();
  const values = await store.counts(list.flatMap((d) => STEPS.map((s) => `fn:${s}:${d}`)));
  return list.map((day, i) => ({ day, ...Object.fromEntries(STEPS.map((s, j) => [s, values[i * STEPS.length + j]])) }));
}
