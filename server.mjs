import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, hasCredentials, MODEL } from './lib/analyze.mjs';
import { demoExtraction } from './lib/demo.mjs';
import { buildReport } from './lib/score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8123);
const MAX_BODY = 12 * 1024 * 1024;

// Pre-launch gate. Off when unset, so local `npm start` needs no setup — set
// both on the host once this is deployed, so a guessed/shared URL isn't open
// to the public before the site is ready to announce.
const GATE_USER = process.env.GATE_USER || '';
const GATE_PASS = process.env.GATE_PASS || '';
const GATE_ENABLED = Boolean(GATE_USER && GATE_PASS);

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, so pad against a same-length
  // zero buffer first rather than short-circuit — a length check alone still
  // leaks length via timing.
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function isAuthorized(req) {
  if (!GATE_ENABLED) return true;
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  let decoded;
  try { decoded = Buffer.from(encoded, 'base64').toString('utf8'); } catch { return false; }
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return safeEqual(user, GATE_USER) && safeEqual(pass, GATE_PASS);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  if (!isAuthorized(req)) {
    res.writeHead(401, { 'content-type': 'text/plain', 'www-authenticate': 'Basic realm="ruangkotak"' });
    res.end('Authentication required.');
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // First-party event beacon. Fire-and-forget, never affects the page.
  if (url.pathname === '/api/ev' && req.method === 'POST') {
    try { const b = await readBody(req); console.log('[ev]', b.toString().slice(0, 200)); } catch {}
    res.writeHead(204).end();
    return;
  }

  if (url.pathname === '/api/audit') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    let payload;
    try {
      payload = JSON.parse((await readBody(req)).toString('utf8'));
    } catch {
      // Never surface a raw parser error to a person.
      return json(res, 400, { error: 'We could not read that upload. Try the screenshot again.' });
    }

    const answers = payload.answers ?? {};
    const images = Array.isArray(payload.images) ? payload.images.slice(0, 2) : [];
    const live = hasCredentials() && images.length > 0;

    try {
      let extraction, usage = null;
      if (live) {
        try {
          ({ extraction, usage } = await analyze({ images, answers }));
        } catch (err) {
          console.error('[audit] model call failed, retrying once:', err.message);
          ({ extraction, usage } = await analyze({ images, answers }));
        }
      } else {
        extraction = demoExtraction(answers);
      }
      const report = buildReport(extraction, answers);
      report.mode = live ? 'live' : 'demo';
      report.model = live ? MODEL : null;
      report.usage = usage;
      return json(res, 200, report);
    } catch (err) {
      console.error('[audit] failed:', err);
      // Degrade to the demo reading rather than showing the user an error.
      const report = buildReport(demoExtraction(answers), answers);
      report.mode = 'demo';
      report.degraded = true;
      return json(res, 200, report);
    }
  }

  // static
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(here, 'public', path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  try {
    const data = await fs.readFile(full);
    res.writeHead(200, { 'content-type': TYPES[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  ruangkotak audit  →  http://localhost:${PORT}`);
  console.log(`  mode: ${hasCredentials() ? `live (${MODEL})` : 'demo — no ANTHROPIC_API_KEY set'}\n`);
});
