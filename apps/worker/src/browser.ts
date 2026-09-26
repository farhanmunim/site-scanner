import { chromium, type Browser, type BrowserContext } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checkIp, resolveAddresses, detectChallenge, loadFingerprints, type BrowserCookie, type BrowserData, type BrowserRequest, type GatheredData } from '@site-scanner/core';
import { parse as parseDomain } from 'tldts';
import { config } from './config.js';
import { log } from './log.js';

/**
 * Browser stage: render the (already fetched, non-restricted) page in Chromium and capture
 * what static analysis cannot see. One context per scan, destroyed afterwards. The browser
 * is only allowed to reach public addresses (route-level SSRF guard) and is capped on
 * requests, time and download size. It never interacts with the page.
 */

const VIEWPORT = { width: 1280, height: 800 };
const MAX_REQUESTS = 300;
const MAX_HTML = 1_000_000;
const NAV_TIMEOUT = 25_000;
const SETTLE_MS = 2500;

let browser: Browser | null = null;
let launches = 0;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected() && launches < 50) return browser;
  await browser?.close().catch(() => {});
  browser = await chromium.launch({
    headless: true,
    // Use a system Chromium when provided (e.g. distro package); otherwise Playwright's bundled build.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--no-first-run', '--mute-audio', '--disable-background-networking', '--disable-quic', '--js-flags=--max-old-space-size=256']
  });
  launches = 0;
  return browser;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close().catch(() => {});
  browser = null;
}

/** Hostnames verified public during this scan (cached so 300 requests don't mean 300 DoH lookups). */
async function hostAllowed(host: string, cache: Map<string, boolean>, blockedIps: Set<string>): Promise<boolean> {
  const hit = cache.get(host);
  if (hit !== undefined) return hit;
  if (/^[\d.]+$|^\[/.test(host)) {
    const ok = checkIp(host.replace(/^\[|\]$/g, ''), blockedIps).ok;
    cache.set(host, ok);
    return ok;
  }
  try {
    const { v4, v6 } = await resolveAddresses(host);
    const all = [...v4, ...v6];
    const ok = all.length > 0 && all.every((ip) => checkIp(ip, blockedIps).ok);
    cache.set(host, ok);
    return ok;
  } catch {
    cache.set(host, false);
    return false;
  }
}

/** Build the list of `js` property paths from the fingerprint DB, evaluated once in the page. */
function jsPaths(): string[] {
  const { db } = loadFingerprints();
  const set = new Set<string>();
  for (const fp of Object.values(db)) for (const k of Object.keys(fp.js ?? {})) set.add(k);
  return [...set];
}
let cachedPaths: string[] | null = null;

export async function renderPage(data: GatheredData, opts: { blockedIps: Set<string>; userAgent: string }): Promise<BrowserData | null> {
  const startUrl = data.http?.final?.url ?? data.target.url;
  const pageSite = parseDomain(new URL(startUrl).hostname).domain;
  const b = await getBrowser();
  launches++;
  let context: BrowserContext | null = null;
  const t0 = Date.now();
  const requests: BrowserRequest[] = [];
  const hostCache = new Map<string, boolean>();
  let consoleErrors = 0;
  let mixedContent = 0;
  let requestCount = 0;

  try {
    context = await b.newContext({
      viewport: VIEWPORT,
      userAgent: opts.userAgent,
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      serviceWorkers: 'block',
      acceptDownloads: false
    });
    context.setDefaultTimeout(NAV_TIMEOUT);

    await context.route('**/*', async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      requestCount++;
      if (requestCount > MAX_REQUESTS) return route.abort('blockedbyclient');
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return route.abort('blockedbyclient');
      // Never let the page fetch anything non-public (our own network, metadata endpoints…).
      if (!(await hostAllowed(u.hostname, hostCache, opts.blockedIps))) return route.abort('blockedbyclient');
      // Never load heavy media; we only need scripts/markup/styles/images for layout.
      if (req.resourceType() === 'media') return route.abort('blockedbyclient');
      if (startUrl.startsWith('https://') && u.protocol === 'http:') mixedContent++;
      return route.continue();
    });
    context.on('request', (req) => {
      const u = new URL(req.url());
      if (requests.length < MAX_REQUESTS) requests.push({ url: req.url().slice(0, 500), host: u.hostname, type: req.resourceType(), status: null, thirdParty: parseDomain(u.hostname).domain !== pageSite });
    });
    context.on('response', (res) => {
      const r = requests.find((x) => x.url === res.url().slice(0, 500) && x.status === null);
      if (r) r.status = res.status();
    });

    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors++;
    });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));

    const response = await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForLoadState('load', { timeout: NAV_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);

    const status = response?.status() ?? 0;
    const headers = response?.headers() ?? {};
    const html = (await page.content()).slice(0, MAX_HTML);
    const blocked = detectChallenge(status, headers, html);

    cachedPaths ??= jsPaths();
    const jsGlobals = (await page
      .evaluate((paths: string[]) => {
        const out: Record<string, string> = {};
        for (const p of paths) {
          try {
            let v: unknown = window as unknown;
            for (const seg of p.split('.')) {
              if (v === null || v === undefined) break;
              v = (v as Record<string, unknown>)[seg];
            }
            if (v === undefined || v === null) continue;
            out[p] = typeof v === 'function' ? 'function' : typeof v === 'object' ? 'object' : String(v).slice(0, 200);
          } catch {
            /* accessor threw */
          }
        }
        return out;
      }, cachedPaths)
      .catch(() => ({}))) as Record<string, string>;

    const rawCookies = await context.cookies();
    const cookies: BrowserCookie[] = rawCookies.map((c) => ({
      name: c.name,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: (c.sameSite as BrowserCookie['sameSite']) ?? null,
      session: c.expires === -1,
      thirdParty: parseDomain(c.domain.replace(/^\./, '')).domain !== pageSite
    }));

    let screenshot: BrowserData['screenshot'] = null;
    if (!blocked) {
      try {
        await mkdir(config.screenshotDir, { recursive: true });
        const file = `${data.scan.id}.jpg`;
        await page.screenshot({ path: join(config.screenshotDir, file), type: 'jpeg', quality: 82, fullPage: false, timeout: 10_000 });
        screenshot = { path: file, width: VIEWPORT.width, height: VIEWPORT.height };
      } catch (e) {
        log.warn({ err: (e as Error).message }, 'screenshot failed');
      }
    }

    return {
      finalUrl: page.url(),
      title: await page.title().catch(() => null),
      renderedHtml: html,
      renderedTruncated: html.length >= MAX_HTML,
      jsGlobals,
      requests,
      cookies,
      screenshot,
      consoleErrors,
      mixedContent,
      loadMs: Date.now() - t0,
      userAgent: opts.userAgent,
      viewport: VIEWPORT,
      blocked
    };
  } catch (e) {
    log.warn({ err: (e as Error).message, url: startUrl }, 'browser stage failed');
    return null;
  } finally {
    await context?.close().catch(() => {});
  }
}
