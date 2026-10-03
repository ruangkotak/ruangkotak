// Cover thumbnails for the report and its PDF. Platform CDN links expire and Instagram blocks hotlinking, so the covers
// the report shows (best and weakest 6) are downloaded once, right after the scrape, shrunk, and stored inside the report
// as data URIs. Every other video drops its remote link. Best effort: a cover that fails to load just leaves a tinted box.
// Server only.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { Report } from "./types";

const MAX_BYTES = 4_000_000;

async function shrink(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return console.warn(`[covers] HTTP ${res.status} for ${new URL(url).host}`), undefined;
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length > MAX_BYTES) return console.warn(`[covers] ${raw.length} bytes is over the limit`), undefined;
    // 9:16 crop to match the report's cover boxes; 240px wide is sharp enough for a 40 to 80pt thumbnail.
    const jpg = await sharp(raw).resize(240, 427, { fit: "cover" }).jpeg({ quality: 72 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch (err) {
    console.warn("[covers]", err instanceof Error ? err.message : err);
    return undefined;
  }
}

export async function attachCovers(r: Report): Promise<Report> {
  const keep = new Set([...r.top, ...r.bottom]);
  const videos = await Promise.all(
    r.videos.map(async (v, i) => {
      if (!v.cover?.startsWith("http")) return v;
      const { cover, ...rest } = v;
      const data = keep.has(i) ? await shrink(cover) : undefined;
      return data ? { ...rest, cover: data } : rest;
    }),
  );
  return { ...r, videos };
}

// JPEG bytes for pdf-lib: a stored data URI, or a bundled sample image under public/.
export async function coverBytes(src?: string): Promise<Uint8Array | null> {
  if (!src) return null;
  try {
    if (src.startsWith("data:image/jpeg;base64,")) return Buffer.from(src.slice(23), "base64");
    if (src.startsWith("/sample/")) return await readFile(join(process.cwd(), "public", src));
  } catch {}
  return null;
}
