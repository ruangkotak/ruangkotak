// Where account data comes from.
// Mock mode (no APIFY_TOKEN): every handle gets the sample Instagram fixture (a real account, username and post links removed), after a short delay
// so the loading sequence can be reviewed. Live mode: scrape via Apify, pillar via TypeSafe (not built yet).
import fixture from "@/data/fixture.json";
import type { AccountData, Platform } from "./types";

export const MOCK = !process.env.APIFY_TOKEN;

export async function fetchAccount(platform: Platform, handle: string): Promise<AccountData> {
  if (MOCK) {
    await new Promise((r) => setTimeout(r, 4200));
    // The fixture carries no handle, so the report shows the one the visitor typed.
    return { ...(fixture as AccountData), handle: `@${handle}` };
  }
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
