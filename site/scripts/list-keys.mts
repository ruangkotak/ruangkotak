// Admin, read-only: list the key names in the ruangkotak Upstash database, with type and time-to-expiry. Values are never read or printed.
//
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npx tsx scripts/list-keys.mts
const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
if (!url || !token) {
  console.error("Missing in your shell: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

async function redis<T>(...cmd: (string | number)[]): Promise<T> {
  const res = await fetch(url!, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(cmd) });
  const body = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.result as T;
}

const keys: string[] = [];
let cursor = "0";
do {
  const [next, batch] = await redis<[string, string[]]>("SCAN", cursor, "MATCH", "*", "COUNT", 200);
  keys.push(...batch);
  cursor = next;
} while (cursor !== "0");

keys.sort();
for (const k of keys) {
  const [type, ttl] = await Promise.all([redis<string>("TYPE", k), redis<number>("TTL", k)]);
  const days = ttl > 0 ? `${Math.round(ttl / 86400)}d` : ttl === -1 ? "no expiry" : "gone";
  console.log(`${k}  [${type}, expires in ${days}]`);
}
console.log(`\n${keys.length} keys`);
