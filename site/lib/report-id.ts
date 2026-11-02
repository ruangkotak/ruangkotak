// Report links and handle checks. Kept separate from the scraper so a lead can be stored
// even when the scrape module (and its fixture) is not loaded.

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
  // The dev fallback makes every report link guessable, so production refuses to run without a real secret.
  if (!process.env.REPORT_SECRET && process.env.VERCEL_ENV === "production") throw new Error("REPORT_SECRET is not set");
  const secret = process.env.REPORT_SECRET ?? "dev-only-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${platform}:${handle}`));
  return Buffer.from(sig).toString("base64url").slice(0, 16);
}
