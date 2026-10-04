// PW=<path to playwright> node render.mjs stills [t,t,...]  |  node render.mjs video   (copy Inter-Medium/Bold/Black.ttf into fonts/ first)
// Video: 30 fps with a 180° shutter (16 sub-frames per frame, averaged) for real motion blur.
import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const DIR = path.dirname(new URL(import.meta.url).pathname);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf' };
const srv = http.createServer((q, r) => { const f = path.join(DIR, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
const port = srv.address().port;
const mode = process.argv[2];
const only = process.env.ONLY;
const FORMATS = [['vertical', 1080, 1920], ['landscape', 1920, 1080]].filter(f => !only || f[0] === only);
const browser = await chromium.launch();
async function open(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  await page.goto(`http://localhost:${port}/index.html?w=${w}&h=${h}`);
  await page.evaluate(() => window.ready);
  return page;
}
const OUT = path.join(DIR, 'out'); fs.mkdirSync(OUT, { recursive: true });
if (mode === 'stills') {
  const times = (process.argv[3] || '0.2,0.4,0.9,1.2,1.5,2.0,2.6,3.6,4.8,5.4,6.4,7.2,7.45,8.2,9.6,10.0,10.3,10.8,11.2,11.6,12.4,13.2,13.5,13.8,14.3,14.95').split(',').map(Number);
  for (const [name, w, h] of FORMATS) {
    const page = await open(w, h);
    for (const t of times) { await page.evaluate(t => window.draw(t), t); await page.screenshot({ path: path.join(OUT, `${name}-${t.toFixed(2)}.png`) }); }
    await page.close();
  }
} else {
  const FPS = 30, SUB = 16, N = 15 * FPS;
  await Promise.all(FORMATS.map(async ([name, w, h]) => {
    const page = await open(w, h);
    const out = path.join(OUT, `showreel-${name}-silent.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-c:v', 'mjpeg', '-i', '-',
      '-vf', `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB,format=yuv420p`, '-r', String(FPS),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let f = 0; f < N; f++) for (let s = 0; s < SUB; s++) {
      await page.evaluate(t => window.draw(t), f / FPS + s / (FPS * SUB * 2)); // sub-frames span half a frame = 180° shutter
      const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % 90 === 0 && s === 0) console.log(name, f, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    console.log('done', out);
  }));
}
await browser.close(); srv.close();
