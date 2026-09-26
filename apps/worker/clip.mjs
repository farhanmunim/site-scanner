import { chromium } from 'playwright';
const [url, out, w, y, h, dark] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: +w, height: 900 }, colorScheme: dark === 'dark' ? 'dark' : 'light' });
await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
await p.screenshot({ path: out, fullPage: true, clip: { x: 0, y: +y, width: +w, height: +h } });
await b.close();
