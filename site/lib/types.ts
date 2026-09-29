export type Platform = "tiktok" | "instagram";

export type Video = {
  title: string;
  views: number;
  pillar: string;
  why?: string;
  cover?: string;
  date?: string; // YYYY-MM-DD posted
  url?: string; // public post link, so anyone can check the view count
};

// One account's raw input to the diagnosis: scraped videos plus the copy Claude wrote and a person reviewed.
export type AccountData = {
  handle: string;
  platform: string;
  date: string;
  followers: number;
  verdict: string;
  videos: Video[]; // newest first
  findings: { h: string; b: string }[];
  fixFirst: string;
  fixThen: string[];
  target: string;
};

export type PillarStat = { name: string; count: number; median: number; multiple: number };

export type Report = AccountData & {
  id: string;
  median: number;
  multiples: number[];
  pillars: PillarStat[];
  top: number[]; // indexes into videos, best first
  bottom: number[]; // weakest first
  fitRecent: { hits: number; of: number }; // recent videos in content types that beat the median
  mock: boolean;
};

export type Teaser = {
  reportId: string;
  handle: string;
  platform: string;
  fitRecent: Report["fitRecent"];
  best: Video & { multiple: number };
  worst: Video & { multiple: number };
  finding: { h: string; b: string };
  mock: boolean;
};
