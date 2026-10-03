// Where account data comes from.
// Mock mode (no APIFY_TOKEN): every handle gets the sample Instagram fixture (a real account, username and post links removed), after a short delay
// so the loading sequence can be reviewed. Live mode: scrape via Apify, then buildAccount below.
import fixture from "@/data/fixture.json";
import { diagnose, longDate } from "./findings";
import { CONTENT_TYPES, tagCaptions } from "./tagger";
import type { AccountData, Platform, Video } from "./types";

export const MOCK = !process.env.APIFY_TOKEN;

// The free mini-diagnosis reads only the newest 15 videos. Scrape no more than this, so the trial stays cheap and fast.
export const TRIAL_VIDEOS = 15;

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
  const { followers, videos } = platform === "tiktok" ? await scrapeTikTok(handle) : await scrapeInstagram(handle);
  // Too few videos to rank against a median: treat it like a failed scrape (private, empty or wrong handle).
  if (videos.length < 3) throw new Error(`Only ${videos.length} public videos for ${platform}:${handle}`);
  return buildAccount({ handle: `@${handle}`, platform: platform === "tiktok" ? "TikTok" : "Instagram", followers }, videos);
}

// Runs an Apify actor and returns its dataset. Cover links are only used once, server-side, by lib/covers.ts: platform CDN links expire and Instagram blocks hotlinking.
async function apify<T>(actor: string, input: object): Promise<T[]> {
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=120`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.APIFY_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(130_000),
  });
  if (!res.ok) throw new Error(`Apify ${actor} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const day = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);
const byNewest = (a: Video, b: Video) => (b.date ?? "").localeCompare(a.date ?? "");

type TikTokItem = { text?: string; playCount?: number; createTimeISO?: string; webVideoUrl?: string; videoMeta?: { coverUrl?: string; originalCoverUrl?: string; dynamicCoverUrl?: string }; authorMeta?: { fans?: number } };

async function scrapeTikTok(handle: string) {
  const items = await apify<TikTokItem>("clockworks~tiktok-scraper", {
    profiles: [handle],
    resultsPerPage: TRIAL_VIDEOS,
    profileScrapeSections: ["videos"],
    profileSorting: "latest",
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  });
  const videos: Video[] = items
    .filter((i) => typeof i.playCount === "number")
    .map((i) => ({ title: i.text ?? "", views: i.playCount!, pillar: "", date: day(i.createTimeISO), url: i.webVideoUrl, cover: i.videoMeta?.coverUrl ?? i.videoMeta?.originalCoverUrl ?? i.videoMeta?.dynamicCoverUrl }))
    .sort(byNewest);
  return { followers: items[0]?.authorMeta?.fans ?? 0, videos };
}

type IgReel = { caption?: string; videoPlayCount?: number; videoViewCount?: number; timestamp?: string; url?: string; displayUrl?: string; thumbnailUrl?: string; images?: string[] };
type IgProfile = { followersCount?: number };

async function scrapeInstagram(handle: string) {
  const [reels, profile] = await Promise.all([
    apify<IgReel>("apify~instagram-reel-scraper", { username: [handle], resultsLimit: TRIAL_VIDEOS }),
    apify<IgProfile>("apify~instagram-profile-scraper", { usernames: [handle] }),
  ]);
  // Field names only, never values: shows which cover field a reel carries when displayUrl is missing.
  const bare = reels.filter((r) => !(r.displayUrl ?? r.thumbnailUrl ?? r.images?.[0]));
  if (bare.length) console.warn(`[covers] ${bare.length} of ${reels.length} reels have no cover link; fields: ${Object.keys(bare[0]).join(",")}`);
  const videos: Video[] = reels
    .map((r) => ({ title: r.caption ?? "", views: r.videoPlayCount ?? r.videoViewCount ?? -1, pillar: "", date: day(r.timestamp), url: r.url, cover: r.displayUrl ?? r.thumbnailUrl ?? r.images?.[0] }))
    .filter((v) => v.views >= 0)
    .sort(byNewest);
  return { followers: profile[0]?.followersCount ?? 0, videos };
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
