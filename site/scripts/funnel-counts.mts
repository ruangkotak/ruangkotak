// Prints daily funnel counts from Upstash. Usage (from site/):
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node --experimental-strip-types scripts/funnel-counts.mts [days=14]
// Pull the two values with `vercel env pull` or paste them from the Vercel dashboard. Read-only.
const { UPSTASH_REDIS_REST_URL: BASE, UPSTASH_REDIS_REST_TOKEN: TOKEN } = process.env;
if (!BASE || !TOKEN) throw new Error("Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");

const STEPS = ["home_view", "preview_started", "preview_completed", "report_viewed", "apply_submitted"] as const;
const days = Number(process.argv[2] ?? 14);
const myDay = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
const list = Array.from({ length: days }, (_, i) => myDay(new Date(Date.now() - i * 86400_000))).reverse();

const keys = list.flatMap((d) => STEPS.map((s) => `rl:fn:${s}:${d}`));
const res = await fetch(`${BASE}/mget/${keys.join("/")}`, { headers: { authorization: `Bearer ${TOKEN}` } });
const { result } = (await res.json()) as { result: (string | null)[] };

const totals = Object.fromEntries(STEPS.map((s) => [s, 0]));
console.log(["day".padEnd(11), ...STEPS.map((s) => s.padStart(18))].join(""));
list.forEach((d, i) => {
  const row = STEPS.map((s, j) => Number(result[i * STEPS.length + j] ?? 0));
  STEPS.forEach((s, j) => (totals[s] += row[j]));
  console.log([d.padEnd(11), ...row.map((n) => String(n).padStart(18))].join(""));
});
console.log(["TOTAL".padEnd(11), ...STEPS.map((s) => String(totals[s]).padStart(18))].join(""));
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "n/a");
console.log(`\nhome view -> started: ${pct(totals.preview_started, totals.home_view)}`);
console.log(`started -> completed: ${pct(totals.preview_completed, totals.preview_started)}`);
console.log(`completed -> applied: ${pct(totals.apply_submitted, totals.preview_completed)}`);
export {};
