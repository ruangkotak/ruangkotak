// Admin: re-scrape one account and overwrite its stored report, so a report made before a pipeline change
// (for example before covers were fetched) is rebuilt with the current code. Runs from your own shell with your own keys.
// It sends no email or Telegram alert, and leaves the lead record alone, so the creator's link keeps working.
//
//   APIFY_TOKEN=... TYPESAFE_API_KEY=... UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
//     npx tsx scripts/rerun-report.mts <instagram|tiktok> <handle> <report-id>
//
// The report id is the last part of the report link (ruangkotak.com/r/<id>). Writes ./rerun-<id>.pdf to check the result.
import { writeFileSync } from "node:fs";
import { analyze } from "../lib/analyze";
import { attachCovers } from "../lib/covers";
import { renderPdf } from "../lib/pdf";
import { fetchAccount, normaliseHandle } from "../lib/source";
import { store } from "../lib/store";
import type { Platform } from "../lib/types";

const [platformArg, handleArg, id] = process.argv.slice(2);
const handle = normaliseHandle(handleArg ?? "");
if ((platformArg !== "instagram" && platformArg !== "tiktok") || !handle || !id) {
  console.error("Usage: npx tsx scripts/rerun-report.mts <instagram|tiktok> <handle> <report-id>");
  process.exit(1);
}
const missing = ["APIFY_TOKEN", "TYPESAFE_API_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing in your shell: ${missing.join(", ")}`);
  process.exit(1);
}
const platform = platformArg as Platform;

console.log(`Scraping ${platform}:${handle} ...`);
const data = await fetchAccount(platform, handle);
console.log(`Got ${data.videos.length} videos; remote cover links on ${data.videos.filter((v) => v.cover?.startsWith("http")).length}`);

const report = await attachCovers(analyze(id, data, false));
const stored = [...report.top, ...report.bottom].filter((i) => report.videos[i].cover?.startsWith("data:")).length;
console.log(`Covers stored for ${stored} of ${report.top.length + report.bottom.length} best/weakest videos`);

await store.saveReport(report); // overwrites in place, keeps the existing expiry
// Drop the cached PDFs so the next download is rebuilt from this report.
const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
const del = await fetch(`${url}/del/pdf:v1:${id}/pdf:v2:${id}/pdf:v3:${id}`, { headers: { authorization: `Bearer ${token}` } });
console.log(`Cached PDFs cleared (HTTP ${del.status})`);

const out = `rerun-${id}.pdf`;
writeFileSync(out, await renderPdf(report));
console.log(`Wrote ${out}. Report: https://ruangkotak.com/r/${id}`);
