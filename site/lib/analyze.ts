import type { AccountData, PillarStat, Report } from "./types";

export const median = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// A group's typical value: the lower middle one, so at least half of the group reached it. Unlike the median,
// an even count never averages the two middle values, so with 2 videos one viral hit can't make the whole group look
// strong (2 how-to videos at 3,000,000 and 295 views read as 295, not 1,500,147). Odd counts give the median.
export const typical = (arr: number[]) => [...arr].sort((a, b) => a - b)[(arr.length - 1) >> 1];

// Same maths as the mini-diagnosis HTML report, so the site and the report never disagree.
// How many best and weakest videos the report shows. Capped at half the videos so the two lists never overlap.
export const PICK = 6;

export function analyze(id: string, data: AccountData, mock: boolean): Report {
  const views = data.videos.map((v) => v.views);
  const med = median(views);
  const multiples = views.map((v) => v / med);

  const groups = new Map<string, number[]>();
  data.videos.forEach((v) => groups.set(v.pillar, [...(groups.get(v.pillar) ?? []), v.views]));
  const pillars: PillarStat[] = [...groups.entries()]
    .map(([name, vs]) => ({ name, count: vs.length, median: typical(vs), multiple: typical(vs) / med }))
    .sort((a, b) => b.multiple - a.multiple);

  const order = views.map((_, i) => i).sort((a, b) => views[b] - views[a]);
  const winning = new Set(pillars.filter((p) => p.multiple >= 1).map((p) => p.name));
  const recent = data.videos.slice(0, 10);
  const k = Math.min(PICK, Math.floor(views.length / 2));

  return {
    ...data,
    id,
    median: med,
    multiples,
    pillars,
    top: order.slice(0, k),
    bottom: order.slice(-k).reverse(),
    fitRecent: { hits: recent.filter((v) => winning.has(v.pillar)).length, of: recent.length },
    mock,
  };
}

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtX = (n: number) => `${n >= 10 ? Math.round(n) : n.toFixed(n >= 1 ? 1 : 2)}x`;
