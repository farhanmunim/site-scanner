import { safeFetch, FetchDenied, type SafeFetchOptions } from '../fetch.js';
import { LIMITS } from '../policy.js';
import { sameSite } from '../url.js';
import type { FetchedFile, FilesStageData } from '../../types.js';

/**
 * Extract script/link URLs from raw HTML without a DOM (runs in the Worker).
 * Only used to decide which *already-referenced* files we may fetch.
 */
export function extractScriptUrls(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const re = /<script\b[^>]*\ssrc\s*=\s*["']?([^"'\s>]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.size < 60) {
    try {
      const u = new URL(m[1]!, baseUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        u.hash = '';
        out.add(u.toString());
      }
    } catch {
      /* ignore */
    }
  }
  return [...out];
}

export interface WordPressRefs {
  /** WordPress is confirmed by strong evidence, not merely mentioned in the page. */
  detected: boolean;
  /** Which signals confirmed it (empty when not confirmed). */
  signals: string[];
  themeSlugs: string[];
  pluginSlugs: string[];
}

const ATTR_URL = /(?:src|href|srcset|data-src|data-lazy-src|content)\s*=\s*["']([^"']+)["']/gi;

/**
 * Is this really WordPress? A page that merely mentions "wp-json" (a tutorial, a docs site) or hotlinks someone
 * else's wp-content is not. Every WordPress lookup (WordPress.org, Wordfence, extra requests to the site) is gated
 * on this, so it has to be strict: one strong signal, or two independent medium ones.
 */
export function confirmWordPress(html: string, pageUrl?: string, headers: Record<string, string> = {}): { confirmed: boolean; signals: string[] } {
  const strong: string[] = [];
  const medium: string[] = [];
  if (/<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*\bcontent\s*=\s*["']WordPress\b/i.test(html) || /<meta\b[^>]*\bcontent\s*=\s*["']WordPress\b[^>]*\bname\s*=\s*["']generator["']/i.test(html)) strong.push('generator meta');
  if (/<link\b[^>]*\brel\s*=\s*["']https:\/\/api\.w\.org\/?["']/i.test(html) || /rel\s*=\s*["']?https:\/\/api\.w\.org\/?["']?/i.test(headers['link'] ?? '')) strong.push('REST API discovery link');
  let host = '';
  try {
    host = pageUrl ? new URL(pageUrl).hostname : '';
  } catch {
    /* no page URL */
  }
  const firstParty = new Set<string>();
  for (const m of html.matchAll(ATTR_URL)) {
    for (const raw of m[1]!.split(/\s*,\s*/)) {
      const u = raw.trim().split(/\s+/)[0] ?? '';
      if (!/\/wp-(?:content|includes)\//i.test(u)) continue;
      // Same site, relative, or an image CDN that carries the site name in the path (i0.wp.com/example.com/wp-content/...).
      let ours = !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(u);
      if (!ours && host) {
        try {
          ours = sameSite(new URL(u, pageUrl).hostname, host) || u.toLowerCase().includes(`/${host.replace(/^www\./, '')}/`);
        } catch {
          ours = false;
        }
      }
      if (ours) firstParty.add(u.replace(/[?#].*$/, ''));
    }
  }
  if (firstParty.size >= 2) strong.push(`${firstParty.size} first-party wp-content/wp-includes assets`);
  else if (firstParty.size === 1) medium.push('1 first-party WordPress asset');
  if (/xmlrpc\.php/i.test(headers['x-pingback'] ?? '')) medium.push('X-Pingback header');
  if (/<link\b[^>]*\brel\s*=\s*["']EditURI["'][^>]*xmlrpc\.php/i.test(html)) medium.push('EditURI link');
  if (/wp-emoji-release\.min\.js/i.test(html)) medium.push('wp-emoji script');
  const signals = [...strong, ...medium];
  return { confirmed: strong.length > 0 || medium.length >= 2, signals };
}

/** Find WordPress theme/plugin slugs referenced by the page (paths only, no guessing). Slugs come only from first-party URLs when the page URL is known. */
export function extractWordPressRefs(html: string, pageUrl?: string, headers: Record<string, string> = {}): WordPressRefs {
  const { confirmed, signals } = confirmWordPress(html, pageUrl, headers);
  const themes = new Set<string>();
  const plugins = new Set<string>();
  if (confirmed) {
    const re = /\/wp-content\/(themes|plugins)\/([a-z0-9_-]+)\//gi;
    const source = pageUrl ? [...html.matchAll(ATTR_URL)].flatMap((m) => m[1]!.split(/\s*,\s*/).map((s) => s.trim().split(/\s+/)[0] ?? '')).filter((u) => confirmedOwn(u, pageUrl)).join('\n') : html;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) (m[1]!.toLowerCase() === 'themes' ? themes : plugins).add(m[2]!.toLowerCase());
  }
  return { detected: confirmed, signals, themeSlugs: [...themes], pluginSlugs: [...plugins].slice(0, LIMITS.maxPluginReadmes) };
}

function confirmedOwn(u: string, pageUrl: string): boolean {
  if (!/\/wp-content\//i.test(u)) return false;
  if (!/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(u)) return true;
  try {
    const host = new URL(pageUrl).hostname;
    return sameSite(new URL(u, pageUrl).hostname, host) || u.toLowerCase().includes(`/${host.replace(/^www\./, '')}/`);
  } catch {
    return false;
  }
}

function pickScripts(urls: string[], targetHost: string): string[] {
  // Prefer first-party bundles (framework/CMS markers) then a few third parties.
  const first = urls.filter((u) => sameSite(new URL(u).hostname, targetHost));
  const third = urls.filter((u) => !sameSite(new URL(u).hostname, targetHost));
  return [...first, ...third].slice(0, LIMITS.maxScriptsFetched);
}

async function tryFetch(url: string, opts: SafeFetchOptions, accept: string): Promise<FetchedFile | null> {
  try {
    const r = await safeFetch(url, { ...opts, accept });
    const path = new URL(url).pathname;
    return { path: sameSite(new URL(url).hostname, opts.target.host) ? path : url, status: r.status, contentType: r.headers['content-type'] ?? null, body: r.status === 200 ? r.body : null, truncated: r.truncated };
  } catch (e) {
    if (e instanceof FetchDenied && e.code === 'budget') return null;
    return null;
  }
}

/**
 * Well-known files + a handful of scripts + CMS public files. Everything requested here is
 * either a standard public file or something the page itself referenced.
 */
export async function gatherFiles(html: string, finalUrl: string, opts: SafeFetchOptions, headers: Record<string, string> = {}): Promise<FilesStageData> {
  const origin = new URL(finalUrl).origin;
  const host = new URL(finalUrl).hostname;
  const scriptUrls = extractScriptUrls(html, finalUrl);
  const wp = extractWordPressRefs(html, finalUrl, headers);

  const cmsFiles = new Set<string>();
  if (wp.detected) {
    for (const t of wp.themeSlugs.slice(0, 2)) cmsFiles.add(`${origin}/wp-content/themes/${t}/style.css`);
    for (const p of wp.pluginSlugs) cmsFiles.add(`${origin}/wp-content/plugins/${p}/readme.txt`);
    cmsFiles.add(`${origin}/wp-json/`);
  }

  const ctx = { discoveredScripts: new Set(scriptUrls), wordpress: wp.detected, discoveredCmsFiles: cmsFiles };
  const o: SafeFetchOptions = { ...opts, target: { host, url: finalUrl }, context: ctx };
  const text = 'text/plain,*/*;q=0.8';

  const [robots, sitemap, securityTxt, adsTxt, llmsTxt] = await Promise.all([
    tryFetch(`${origin}/robots.txt`, o, text),
    tryFetch(`${origin}/sitemap.xml`, o, 'application/xml,text/xml,*/*;q=0.8'),
    tryFetch(`${origin}/.well-known/security.txt`, o, text),
    tryFetch(`${origin}/ads.txt`, o, text),
    tryFetch(`${origin}/llms.txt`, o, text)
  ]);

  const scripts = (await Promise.all(pickScripts(scriptUrls, host).map((u) => tryFetch(u, o, 'application/javascript,*/*;q=0.8')))).filter((f): f is FetchedFile => !!f);
  const cms = (await Promise.all([...cmsFiles].map((u) => tryFetch(u, o, u.endsWith('/wp-json/') ? 'application/json' : text)))).filter((f): f is FetchedFile => !!f);

  return { robots, sitemap, securityTxt, adsTxt, llmsTxt, scripts, cms };
}
