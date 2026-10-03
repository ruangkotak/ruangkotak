// Turns tagged videos into the mini-diagnosis text. Select, don't generate: every finding is a fixed template that
// only fires when the numbers support it, filled with the account's own figures and captions. Candidates are scored
// by effect size and the three strongest are kept, so the same data always gives the same report.
import { fmt, fmtX, median, typical } from "./analyze";
import { CONTENT_TYPES, cleanCaption } from "./tagger";
import type { AccountData, Video } from "./types";

type Diagnosis = Pick<AccountData, "verdict" | "findings" | "fixFirst" | "fixThen" | "target">;
type Candidate = { key: string; score: number; h: string; b: string; verdict: string; fix: string; target?: string };

const NOUN: Record<string, string> = Object.fromEntries(Object.values(CONTENT_TYPES).map((t) => [t.label, t.noun]));
const noun = (label: string) => NOUN[label] ?? `${label.toLowerCase()} videos`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const quote = (title: string, max = 70) => {
  const c = cleanCaption(title);
  return `“${c.length > max ? `${c.slice(0, max - 1).trimEnd()}…` : c}”`;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso?: string) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}` : "");
// 15 videos is a small sample: below this many supporting videos, a fix is framed as a test, not a rule.
const SOLID = 5;
const aOne = (plural: string) => {
  const s = plural.replace(/s$/, "");
  return `${/^[aeiou]/.test(s) ? "an" : "a"} ${s}`;
};
const pct = (n: number, of: number) => Math.round((n / of) * 100);
const IGNORED = new Set<string>([CONTENT_TYPES.other.label, CONTENT_TYPES.no_caption.label]);

// Type-specific advice for a content type that drags; anything else gets the generic line.
const DRAG_FIX: Record<string, string> = {
  [CONTENT_TYPES.first_look.label]: "Stop posting plain first looks. Open with what the product does for the viewer, then show it.",
  [CONTENT_TYPES.promo.label]: "Keep deals and sponsored posts to 1 in 5 videos, and open them with the viewer's problem, not the offer.",
  [CONTENT_TYPES.vlog.label]: "Keep event visits and day-in-the-life clips for Stories unless someone pays for the reach.",
};

export const longDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

export function diagnose(videos: Video[], today = new Date()): Diagnosis & { why: string[] } {
  const total = videos.length;
  const med = median(videos.map((v) => v.views));
  const mult = videos.map((v) => v.views / med);
  const hasCaption = (v: Video) => cleanCaption(v.title).length >= 3;
  const idx = videos.map((_, i) => i);

  const groups = new Map<string, number[]>();
  videos.forEach((v, i) => groups.set(v.pillar, [...(groups.get(v.pillar) ?? []), i]));
  const stats = [...groups.entries()].map(([label, is]) => ({
    label,
    n: is.length,
    m: typical(is.map((i) => mult[i])),
    views: typical(is.map((i) => videos[i].views)),
  }));

  const c: Candidate[] = [];

  // Best content type, and whether it is also the rarest.
  const leader = stats.filter((s) => s.n >= 2 && !IGNORED.has(s.label)).sort((a, b) => b.m - a.m)[0];
  const best = leader && leader.m >= 1.25 ? leader : undefined;
  if (best) {
    const nn = noun(best.label);
    const goal = Math.round(med * (1 + (Math.min(best.m, 3) - 1) / 2));
    const b = `Your ${best.n} ${nn} typically got ${fmt(best.views)} views, ${fmtX(best.m)} your usual ${fmt(med)}.`;
    if (best.n / total <= 0.25)
      c.push({
        key: "best",
        score: best.m * 2,
        h: `${cap(nn)} are your best, and your rarest`,
        b: `${b} Yet they are only ${best.n} of your last ${total} videos.`,
        verdict: `Your ${nn} get ${fmtX(best.m)} your usual views, but you made only ${best.n} of them in your last ${total} videos.`,
        fix:
          best.n >= SOLID
            ? `Make ${nn} at least half of your next 10 videos.`
            : `Test it: make ${nn} 4 of your next 10 videos and see if they keep beating your usual.`,
        target: `${best.n >= SOLID ? "5" : "4"} ${nn} in your next 10 videos. Median up from {median} to ${fmt(goal)} views.`,
      });
    else
      c.push({
        key: "best",
        score: best.m * 1.2,
        h: `${cap(nn)} are your strongest content type`,
        b,
        verdict: `Your ${nn} are working: ${fmtX(best.m)} your usual views across ${best.n} videos.`,
        fix:
          best.n >= SOLID
            ? `Plan your next 10 videos around ${nn}, and keep them at least half of what you post.`
            : `Test it: make ${nn} 5 of your next 10 videos and see if they keep beating your usual.`,
        target: `5 ${nn} in your next 10 videos. Median up from {median} to ${fmt(goal)} views.`,
      });
  }

  // A content type that takes up a big share of the feed but sits below the usual.
  const drag = stats
    .filter((s) => s.n >= 3 && s.n / total >= 0.25 && s.m <= 0.9 && s.label !== best?.label && s.label !== CONTENT_TYPES.other.label)
    .sort((a, b) => a.m - b.m)[0];
  if (drag) {
    const nn = noun(drag.label);
    c.push({
      key: "drag",
      score: (1 / drag.m) * (drag.n / total) * 3,
      h: `${cap(nn)} are ${pct(drag.n, total)}% of your videos but sit below your usual`,
      b: `Your ${drag.n} ${nn} typically got ${fmt(drag.views)} views, ${fmtX(drag.m)} your usual ${fmt(med)}.`,
      verdict: `${pct(drag.n, total)}% of your videos are ${nn}, and they get only ${fmtX(drag.m)} your usual views.`,
      fix: DRAG_FIX[drag.label] ?? `Post fewer ${nn}: cap them at 1 in 5 videos.`,
    });
  }

  // Captions that give a reason to watch versus captions that only name the topic.
  const withR = idx.filter((i) => hasCaption(videos[i]) && (videos[i].reason ?? 0) >= 0.5);
  const without = idx.filter((i) => hasCaption(videos[i]) && (videos[i].reason ?? 1) < 0.5);
  if (withR.length >= 3 && without.length >= 3) {
    const a = typical(withR.map((i) => mult[i]));
    const z = typical(without.map((i) => mult[i]));
    const ex = videos[[...withR].sort((p, q) => videos[q].views - videos[p].views)[0]].title;
    if (a / z >= 1.3)
      c.push({
        key: "reason",
        score: a / z,
        h: `Captions with a reason to watch get ${fmtX(a / z)} the views`,
        b: `Your ${withR.length} videos whose caption promises a benefit, a problem or a claim typically got ${fmtX(a)} your usual views. The ${without.length} that only name the topic got ${fmtX(z)}. Your best one opened with ${quote(ex)}.`,
        verdict: `Captions that give a reason to watch get ${fmtX(a / z)} the views of captions that only name the topic.`,
        fix: `Write every caption's first line as a reason to watch, like ${quote(ex, 50)}, not just the product or topic name.`,
      });
  }

  // One video far above the rest, and whether anything since followed it up.
  const top = mult.indexOf(Math.max(...mult));
  const later = top; // videos are newest first, so everything before `top` came after it
  const same = videos.slice(0, top).filter((x) => x.pillar === videos[top].pillar).length;
  // Only worth saying when nothing like it followed; if its type is posted often anyway, the type findings cover it.
  const standout = mult[top] >= 2.5 && same <= 1;
  if (standout) {
    const v = videos[top];
    const nn = noun(v.pillar);
    const since =
      later === 0
        ? "It is your newest video."
        : same === 0
          ? later === 1
            ? `The one video you posted after it was not one of your ${nn}.`
            : `${later === 2 ? "Neither" : "None"} of the ${later} videos you posted after it ${later === 2 ? `was ${aOne(nn)}` : `were ${nn}`}.`
          : `Only ${same} of the ${later} videos you posted after it ${same === 1 ? `was ${aOne(nn)}` : `were ${nn}`}.`;
    c.push({
      key: "top",
      score: mult[top] * (later > 0 ? 1 : 0.6),
      h: `Your best video pulled ${fmtX(mult[top])} your usual views`,
      b: `${quote(v.title)} got ${fmt(v.views)} views${v.date ? ` on ${day(v.date)}` : ""}. ${since}`,
      verdict:
        later === 0
          ? `Your newest video pulled ${fmtX(mult[top])} your usual views. Follow it up while it is fresh.`
          : `Your best video pulled ${fmtX(mult[top])} your usual views, and ${same === 0 ? "you never made another like it" : `only ${same} of the ${later} videos since ${same === 1 ? `was ${aOne(nn)}` : `were ${nn}`}`}.`,
      fix: `Make a follow-up to ${quote(v.title, 45)} this week${(v.series ?? 0) >= 0.5 ? "" : " and call it Part 2"}.`,
      target: `4 follow-ups to your best video in 30 days. Median up from {median} to ${fmt(Math.round(med * 1.5))} views.`,
    });
  }

  // Series episodes versus one-offs.
  const ser = idx.filter((i) => (videos[i].series ?? 0) >= 0.5);
  const one = idx.filter((i) => (videos[i].series ?? 0) < 0.5);
  if (ser.length >= 2 && one.length >= 3) {
    const r = typical(ser.map((i) => mult[i])) / typical(one.map((i) => mult[i]));
    if (r >= 1.3)
      c.push({
        key: "series",
        score: r,
        h: "Your series episodes beat your one-offs",
        b: `Your ${ser.length} series episodes got ${fmtX(r)} the views of your one-off videos.`,
        verdict: `Your series episodes get ${fmtX(r)} the views of your one-offs.`,
        fix: "Turn your best topic into a numbered series and post the next episode on the same day each week.",
      });
  }

  // Videos without a caption.
  const bare = groups.get(CONTENT_TYPES.no_caption.label);
  if (bare?.length) {
    const m = typical(bare.map((i) => mult[i]));
    if (m < 1)
      c.push({
        key: "bare",
        score: 1.1 + bare.length / total,
        h: "Videos without a caption sink",
        b: `Your ${bare.length === 1 ? "one video" : `${bare.length} videos`} with no caption got ${fmtX(m)} your usual views.`,
        verdict: `Your videos without a caption get ${fmtX(m)} your usual views.`,
        fix: "Always write the first line of the caption, as a reason to watch.",
      });
  }

  // A long gap since the newest video.
  const newest = videos[0]?.date;
  const gap = newest ? Math.floor((today.getTime() - new Date(`${newest}T00:00:00Z`).getTime()) / 86_400_000) : 0;
  if (gap >= 30)
    c.push({
      key: "gap",
      score: gap >= 60 ? 4 : 1.6,
      h: `No new video in ${gap} days`,
      b: `Your newest video is from ${day(newest)}. Reach drops while an account is quiet, and comes back slowly.`,
      // Only videos are scraped (reels on Instagram), so photo and carousel posts are invisible here: say "a video".
      verdict: `You have not posted a video in ${gap} days.`,
      fix: `Post again this week${standout ? ", starting with a follow-up to your best video" : best ? `, starting with ${noun(best.label)}` : ""}.`,
    });

  // Always true, so it backs up a report where few patterns clear the bar: the 3 best against the 3 weakest.
  if (total >= 6) {
    const order = [...idx].sort((p, q) => videos[q].views - videos[p].views);
    const hi = order.slice(0, 3);
    const lo = order.slice(-3);
    const range = (is: number[]) => `${fmt(Math.min(...is.map((i) => videos[i].views)))} to ${fmt(Math.max(...is.map((i) => videos[i].views)))}`;
    const common = (is: number[]) => {
      const counts = new Map<string, number>();
      is.forEach((i) => counts.set(videos[i].pillar, (counts.get(videos[i].pillar) ?? 0) + 1));
      const [label, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return n >= 2 && !IGNORED.has(label) ? { label, n } : null;
    };
    const ch = common(hi);
    const cl = common(lo);
    const parts = [
      ch && `${ch.n === 3 ? "All 3" : `${ch.n} of`} your best are ${noun(ch.label)}.`,
      cl && cl.label !== ch?.label && `${cl.n === 3 ? "All 3" : `${cl.n} of`} your weakest are ${noun(cl.label)}.`,
    ].filter(Boolean);
    c.push({
      key: "spread",
      score: 0.5 + parts.length * 0.3,
      h: "Your 3 best against your 3 weakest",
      b: `Your 3 best videos got ${range(hi)} views; your 3 weakest got ${range(lo)}. ${parts.join(" ")}`.trim(),
      verdict: `Your best videos get ${fmtX(mult[hi[0]])} your usual views and your weakest ${fmtX(mult[lo[2]])}, from the same account.`,
      fix: ch
        ? `Before each video, ask whether it is closer to your 3 best or your 3 weakest, and post the ones closer to the best.`
        : "Write every caption's first line as a reason to watch: a problem, a benefit or a bold claim.",
    });
  }

  const picked = c.sort((a, b) => b.score - a.score).slice(0, 3);
  if (!picked.length) {
    const lo = Math.min(...mult);
    const hi = Math.max(...mult);
    picked.push({
      key: "flat",
      score: 0,
      h: "No content type clearly wins yet",
      b: `Across your last ${total} videos, views run from ${fmtX(lo)} to ${fmtX(hi)} your usual, but no content type stands out. The difference is inside each video: the first line and the first seconds.`,
      verdict: `Your videos swing from ${fmtX(lo)} to ${fmtX(hi)} your usual views, and content type is not what decides it.`,
      fix: "Write every caption's first line as a reason to watch: a problem, a benefit or a bold claim.",
    });
  }

  const why = videos.map((v) =>
    !hasCaption(v)
      ? `${v.pillar}. No caption to pull viewers in.`
      : `${v.pillar}. ${(v.reason ?? 0) >= 0.5 ? "The caption gives a reason to watch." : "The caption gives no clear reason to watch."}`,
  );

  return {
    verdict: picked[0].verdict,
    findings: picked.map(({ h, b }) => ({ h, b })),
    fixFirst: picked[0].fix,
    fixThen: picked.slice(1).map((p) => p.fix),
    target:
      picked.find((p) => p.target)?.target ?? `8 videos in 30 days using the fix above. Median up from {median} to ${fmt(Math.round(med * 1.3))} views.`,
    why,
  };
}
