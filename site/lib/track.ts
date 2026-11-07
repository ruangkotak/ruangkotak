// Aggregate funnel counters: one number per step per day (Malaysia time), no personal data.
// Read them with `node --experimental-strip-types scripts/funnel-counts.ts`.
// Counters never break a request: a Redis hiccup is logged and swallowed.
import { store } from "./store";

export type Step = "preview_started" | "preview_completed" | "report_viewed" | "apply_submitted";

const KEEP = 90 * 24 * 60 * 60;
export const myDay = (d = new Date()) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

export async function track(step: Step) {
  try {
    await store.hit(`fn:${step}:${myDay()}`, KEEP);
  } catch (err) {
    console.error("[track]", step, err);
  }
}
