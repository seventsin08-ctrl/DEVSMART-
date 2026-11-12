// Captures a scroll-through of a page as numbered frames (assemble into a video with ffmpeg).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [,, url, outDir, w = '1280', h = '800', step = '40'] = process.argv;
mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url, { waitUntil: 'domcontentloaded' });
let n = 0;
const shot = () => p.screenshot({ path: `${outDir}/f${String(n++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 80 });
for (let i = 0; i < 26; i++) await shot();                       // intro animation
const total = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
for (let y = 0; y <= total; y += +step) { await p.evaluate((v) => scrollTo(0, v), y); await shot(); }
for (let i = 0; i < 8; i++) await shot();
console.log('frames', n, 'overflowX', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'errors', errs.slice(0, 4));
await b.close();
