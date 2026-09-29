// Where account data comes from.
// Mock mode (no APIFY_TOKEN): every handle gets the sample Instagram fixture (a real account, username and post links removed), after a short delay
// so the loading sequence can be reviewed. Live mode: scrape via Apify (not wired yet), then buildAccount below.
import fixture from "@/data/fixture.json";
import { diagnose, longDate } from "./findings";
import { CONTENT_TYPES, tagCaptions } from "./tagger";
import type { AccountData, Platform, Video } from "./types";

export const MOCK = !process.env.APIFY_TOKEN;

// The free mini-diagnosis reads only the newest 18 videos. Scrape no more than this, so the trial stays cheap and fast.
export const TRIAL_VIDEOS = 18;

// Scraped videos (newest first) -> TypeSafe tags -> findings picked and filled by code.
export async function buildAccount(meta: { handle: string; platform: string; followers: number }, scraped: Video[]): Promise<AccountData> {
  const recent = scraped.slice(0, TRIAL_VIDEOS);
  const tags = await tagCaptions(recent.map((v) => v.title));
  const videos: Video[] = recent.map((v, i) => ({
    ...v,
    pillar: CONTENT_TYPES[tags[i].type].label,
    typeConfidence: tags[i].confidence,
    reason: tags[i].reason,
    series: tags[i].series,
  }));
  const { why, ...text } = diagnose(videos);
  return {
    ...meta,
    date: longDate(new Date(Date.now() + 8 * 3_600_000)), // Malaysia time (UTC+8)
    videos: videos.map((v, i) => ({ ...v, why: why[i] })),
    ...text,
  };
}

export async function fetchAccount(platform: Platform, handle: string): Promise<AccountData> {
  if (MOCK) {
    await new Promise((r) => setTimeout(r, 4200));
    // The fixture carries no handle, so the report shows the one the visitor typed.
    const sample = { ...(fixture as AccountData), handle: `@${handle}` };
    // Local testing only: MOCK_ENGINE=1 runs the TypeSafe engine on the sample videos instead of the hand-written copy.
    if (process.env.MOCK_ENGINE === "1") return buildAccount(sample, sample.videos);
    return sample;
  }
  // When Apify is wired: fetch the newest TRIAL_VIDEOS videos, map them to Video, then `return buildAccount(meta, videos)`.
  throw new Error(`Live scrape not wired yet (${platform} ${handle})`);
}

export function normaliseHandle(raw: string) {
  const h = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?(tiktok|instagram)\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "")
    .toLowerCase();
  return /^[a-z0-9._]{2,30}$/.test(h) ? h : null;
}

// Keyed with a server secret so nobody can work out another account's report link from its handle.
export async function reportIdFor(platform: string, handle: string) {
  const secret = process.env.REPORT_SECRET ?? "dev-only-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${platform}:${handle}`));
  return Buffer.from(sig).toString("base64url").slice(0, 16);
}
