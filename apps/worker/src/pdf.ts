import { chromium, type Browser } from 'playwright';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';
import { log } from './log.js';

/**
 * PDF export: render our own report page (print mode) in Chromium. This never touches the
 * scanned site — it only loads the web app over the internal Docker network.
 */
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  return browser;
}

export async function closePdfBrowser(): Promise<void> {
  await browser?.close().catch(() => {});
  browser = null;
}

export async function renderPdf(scanId: string): Promise<string> {
  await mkdir(config.pdfDir, { recursive: true });
  const target = join(config.pdfDir, `${scanId}.pdf`);
  const tmp = target + '.tmp';
  const b = await getBrowser();
  const context = await b.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const url = `${config.internalWebUrl}/r/${scanId}?print=1`;
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
    if (!res || res.status() !== 200) throw new Error(`report page returned ${res?.status() ?? 'no response'}`);
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: tmp, format: 'A4', printBackground: true, preferCSSPageSize: false, margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: `<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:sans-serif">${config.publicSiteUrl.replace(/^https?:\/\//, '')}/r/${scanId} · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>` });
    await rename(tmp, target);
    log.info({ scanId }, 'pdf rendered');
    return target;
  } finally {
    await context.close().catch(() => {});
  }
}
