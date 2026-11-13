// Records a page as a real-time MP4 using Chromium's screencast (frames carry timestamps, so
// animations play back at true speed).  node dev/tools/screencast.mjs <file.html|url> <out.mp4> [--tour] [--w=1280] [--h=800]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const [target, out] = args;
const flag = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const W = +flag('w', 1280), H = +flag('h', 800), TOUR = args.includes('--tour'), WAIT = +flag('wait', 3500);
const dir = path.join(path.dirname(path.resolve(out)), `.frames-${process.pid}`);
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async (f) => {
  frames.push({ t: f.metadata.timestamp, data: f.data });
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 74, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

if (target.endsWith('.html')) {
  const body = readFileSync(target, 'utf8');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`);
} else await page.goto(target, { waitUntil: 'domcontentloaded' });

await page.waitForTimeout(WAIT);
if (TOUR) {
  await page.getByRole('button', { name: /Tour/ }).click();
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const atEnd = await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 4);
    if (atEnd) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(2200);
}
await cdp.send('Page.stopScreencast');
const stats = await page.evaluate(() => ({ pending: document.querySelectorAll('[data-build="pending"]').length, done: document.querySelectorAll('[data-build="done"]').length, overflow: document.documentElement.scrollWidth - innerWidth }));
console.log('frames', frames.length, 'seconds', (frames.at(-1).t - frames[0].t).toFixed(1), stats, 'errors', errors.slice(0, 3));
await browser.close();

let list = '';
frames.forEach((f, i) => {
  const name = `f${String(i).padStart(5, '0')}.jpg`;
  writeFileSync(path.join(dir, name), Buffer.from(f.data, 'base64'));
  const next = frames[i + 1]?.t ?? f.t + 1;
  list += `file '${name}'\nduration ${Math.min(0.5, Math.max(0.001, next - f.t)).toFixed(4)}\n`;
});
list += `file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
writeFileSync(path.join(dir, 'list.txt'), list);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '27', '-preset', 'veryfast', '-movflags', '+faststart', path.resolve(out)]);
rmSync(dir, { recursive: true, force: true });
console.log('wrote', out);
