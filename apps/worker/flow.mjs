import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const mk = async (w, dark) => { const c = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: dark ? 'dark' : 'light' }); const p = await c.newPage(); p.on('console', m => { if (m.type() === 'error') errors.push(`[${w}${dark?'d':'l'}] ${m.text()}`); }); p.on('pageerror', e => errors.push(`[${w}] ${e.message}`)); return p; };
const S = '../../.scratch/';
// 1. home light desktop + start a scan → modal → report
const p = await mk(1280, false);
await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await p.screenshot({ path: S + 'v5-home.png', fullPage: true });
await p.fill('#url', 'www.smashingmagazine.com');
await p.click('.btn-scan');
await p.waitForSelector('.shield', { timeout: 10000 });
await p.waitForTimeout(3500);
await p.screenshot({ path: S + 'v5-modal.png' });
await p.waitForURL(/\/r\//, { timeout: 120000 });
await p.waitForLoadState('networkidle');
await p.waitForTimeout(800);
const url = p.url(); console.log('report', url);
await p.screenshot({ path: S + 'v5-report.png', fullPage: true });
// 2. dark desktop report + home
const d = await mk(1280, true);
await d.goto(url, { waitUntil: 'networkidle' }); await d.waitForTimeout(500);
await d.screenshot({ path: S + 'v5-report-dark.png', fullPage: true });
await d.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await d.screenshot({ path: S + 'v5-home-dark.png', fullPage: true });
// toggle persists
await d.click('.ibtn'); await d.waitForTimeout(200); const t1 = await d.evaluate(() => document.documentElement.dataset.theme); await d.reload({ waitUntil: 'networkidle' }); const t2 = await d.evaluate(() => document.documentElement.dataset.theme); console.log('toggle', t1, 'after reload', t2);
// 3. mobile light
const m = await mk(390, false);
await m.goto('http://localhost:3000/', { waitUntil: 'networkidle' }); await m.screenshot({ path: S + 'v5-home-m.png', fullPage: true });
await m.goto(url, { waitUntil: 'networkidle' }); await m.waitForTimeout(500); await m.screenshot({ path: S + 'v5-report-m.png', fullPage: true });
console.log('console errors:', errors.length ? errors : 'none');
await b.close();
