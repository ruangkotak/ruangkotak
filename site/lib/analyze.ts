import type { AccountData, PillarStat, Report, Teaser } from "./types";

export const median = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Same maths as the mini-diagnosis HTML report, so the site and the report never disagree.
export function analyze(id: string, data: AccountData, mock: boolean): Report {
  const views = data.videos.map((v) => v.views);
  const med = median(views);
  const multiples = views.map((v) => v / med);

  const groups = new Map<string, number[]>();
  data.videos.forEach((v) => groups.set(v.pillar, [...(groups.get(v.pillar) ?? []), v.views]));
  const pillars: PillarStat[] = [...groups.entries()]
    .map(([name, vs]) => ({ name, count: vs.length, median: median(vs), multiple: median(vs) / med }))
    .sort((a, b) => b.multiple - a.multiple);

  const order = views.map((_, i) => i).sort((a, b) => views[b] - views[a]);
  const winning = new Set(pillars.filter((p) => p.multiple >= 1).map((p) => p.name));
  const recent = data.videos.slice(0, 10);

  return {
    ...data,
    id,
    median: med,
    multiples,
    pillars,
    top: order.slice(0, 3),
    bottom: order.slice(-3).reverse(),
    fitRecent: { hits: recent.filter((v) => winning.has(v.pillar)).length, of: recent.length },
    mock,
  };
}

export function toTeaser(r: Report): Teaser {
  const [b] = r.top;
  const [w] = r.bottom;
  return {
    reportId: r.id,
    handle: r.handle,
    platform: r.platform,
    fitRecent: r.fitRecent,
    best: { ...r.videos[b], multiple: r.multiples[b] },
    worst: { ...r.videos[w], multiple: r.multiples[w] },
    finding: r.findings[0],
    mock: r.mock,
  };
}

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtX = (n: number) => `${n >= 10 ? Math.round(n) : n.toFixed(n >= 1 ? 1 : 2)}x`;
