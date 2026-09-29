import type { ConsentRecord } from "./legal";

export type Platform = "tiktok" | "instagram";

export type Video = {
  title: string;
  views: number;
  pillar: string;
  why?: string;
  cover?: string;
  date?: string; // YYYY-MM-DD posted
  url?: string; // public post link, so anyone can check the view count
  // Set by the TypeSafe tagger (lib/tagger.ts) on live reports; absent on hand-written ones.
  typeConfidence?: number; // 0-1, how sure the content-type pick is
  reason?: number; // 0-1 probability the caption gives a reason to keep watching
  series?: number; // 0-1 probability the caption marks a series episode
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

// Who asked for a mini-diagnosis. Taken before any scraping, so every report we pay for comes with a lead.
export type Lead = {
  name: string;
  email: string;
  whatsapp: string;
  marketing: boolean; // opted in to follow-ups (PDPA s43); without it we only send the report itself
  consent: ConsentRecord;
};
