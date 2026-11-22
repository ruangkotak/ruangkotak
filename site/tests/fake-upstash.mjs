// A stand-in for Upstash Redis's REST API, for testing lib/store.ts's Redis code paths without touching the live store.
// Run:  node tests/fake-upstash.mjs 3124
// Then start the site with UPSTASH_REDIS_REST_URL=http://127.0.0.1:3124 and UPSTASH_REDIS_REST_TOKEN=test.
// It answers the commands the store uses, in the shapes Redis gives (HGETALL as a flat field, value list). In memory only.
import { createServer } from "node:http";

const strings = new Map();
const hashes = new Map();
const lists = new Map();
const seen = [];
const up = (s) => String(s).toUpperCase();

function run([name, ...a]) {
  const cmd = up(name);
  seen.push(cmd);
  switch (cmd) {
    case "PING": return "PONG";
    case "GET": return strings.get(a[0]) ?? null;
    case "SET": {
      const flags = a.slice(2).map(up);
      if (flags.includes("NX") && strings.has(a[0])) return null;
      strings.set(a[0], String(a[1]));
      return "OK";
    }
    case "MGET": return a.map((k) => strings.get(k) ?? null);
    case "INCR": { const n = Number(strings.get(a[0]) ?? 0) + 1; strings.set(a[0], String(n)); return n; }
    case "EXISTS": return strings.has(a[0]) || hashes.has(a[0]) || lists.has(a[0]) ? 1 : 0;
    case "EXPIRE": return 1;
    case "TTL": return strings.has(a[0]) ? 1000 : -2;
    case "HSET": { const h = hashes.get(a[0]) ?? new Map(); hashes.set(a[0], h); const fresh = h.has(a[1]) ? 0 : 1; h.set(a[1], String(a[2])); return fresh; }
    case "HGET": return hashes.get(a[0])?.get(a[1]) ?? null;
    case "HGETALL": return [...(hashes.get(a[0]) ?? [])].flat();
    case "HLEN": return hashes.get(a[0])?.size ?? 0;
    case "HDEL": { const h = hashes.get(a[0]); let n = 0; for (const f of a.slice(1)) if (h?.delete(f)) n++; return n; }
    case "LPUSH": { const l = lists.get(a[0]) ?? []; lists.set(a[0], l); l.unshift(String(a[1])); return l.length; }
    case "RPUSH": { const l = lists.get(a[0]) ?? []; lists.set(a[0], l); l.push(String(a[1])); return l.length; }
    case "LTRIM": { const l = lists.get(a[0]) ?? []; lists.set(a[0], l.slice(Number(a[1]), Number(a[2]) + 1)); return "OK"; }
    case "LRANGE": { const l = lists.get(a[0]) ?? []; return l.slice(Number(a[1]), Number(a[2]) === -1 ? undefined : Number(a[2]) + 1); }
    case "SCAN": { const pre = String(a[2] ?? "*").replace(/\*$/, ""); return ["0", [...strings.keys()].filter((k) => k.startsWith(pre))]; }
    default: throw new Error(`fake-upstash: command not supported: ${cmd}`);
  }
}

createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d)).on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/_seen") return res.end(JSON.stringify([...new Set(seen)].sort())); // which commands were exercised
    try {
      res.end(JSON.stringify({ result: run(JSON.parse(body)) }));
    } catch (err) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}).listen(Number(process.argv[2] ?? 3124), "127.0.0.1");
