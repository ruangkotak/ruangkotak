// node render.mjs stills  |  node render.mjs video
import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(DIR, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
const port = srv.address().port;
const mode = process.argv[2];
const FORMATS = [['landscape', 1920, 1080], ['vertical', 1080, 1920]];
const browser = await chromium.launch();
async function open(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  await page.goto(`http://localhost:${port}/index.html?w=${w}&h=${h}`);
  await page.evaluate(() => window.ready);
  return page;
}
if (mode === 'stills') {
  const times = (process.argv[3] || '0.3,0.6,1.1,2.0,2.8,3.3,3.7,4.5,5.3,6.2,7.3,7.7,8.5,8.8,9.3,10.2,10.6,11.0,11.5,11.9,12.3,12.55,12.8,13.1,13.5,14.9').split(',').map(Number);
  fs.mkdirSync(path.join(DIR, 'stills'), { recursive: true });
  for (const [name, w, h] of FORMATS) {
    const page = await open(w, h);
    for (const t of times) { await page.evaluate(t => window.draw(t), t); await page.screenshot({ path: path.join(DIR, 'stills', `${name}-${t.toFixed(2)}.png`) }); }
    await page.close();
  }
} else {
  const FPS = 120, N = 15 * FPS;
  await Promise.all(FORMATS.map(async ([name, w, h]) => {
    const page = await open(w, h);
    const out = path.join(DIR, `ruangkotak-reel-${name}.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-vf', 'tmix=frames=2,fps=60,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let f = 0; f < N; f++) {
      await page.evaluate(t => window.draw(t), f / FPS);
      const buf = await page.screenshot({ type: 'png' });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % 240 === 0) console.log(name, f, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    console.log('done', out);
  }));
}
await browser.close(); srv.close();
