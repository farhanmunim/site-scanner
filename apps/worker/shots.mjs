import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = []; const S = '../../.scratch/';
const url = process.argv[2];
const mk = async (w, dark) => { const c = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: dark ? 'dark' : 'light' }); const p = await c.newPage(); p.on('console', m => { if (m.type() === 'error') errors.push(`[${w}${dark?'d':'l'}] ${m.text().slice(0,200)}`); }); p.on('pageerror', e => errors.push(`[${w}] ${e.message}`)); return p; };
for (const [w, dark, tag] of [[1280, false, ''], [1280, true, '-dark'], [390, false, '-m']]) {
  const p = await mk(w, dark);
  await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  await p.screenshot({ path: `${S}v5-report${tag}.png`, fullPage: true });
  if (tag === '') { await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' }); await p.screenshot({ path: `${S}v5-home.png`, fullPage: true }); }
}
console.log('console errors:', errors.length ? errors : 'none');
await b.close();
