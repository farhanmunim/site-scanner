import { safeFetch, FetchDenied, type SafeFetchOptions } from '../fetch.js';
import { LIMITS } from '../policy.js';
import { sameSite } from '../url.js';
import type { FetchedFile, FilesStageData, MediaFile } from '../../types.js';

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

const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((x) => x !== undefined) ?? null;

/** The favicon and share-image URLs the page itself points to (or the conventional /favicon.ico). Pure. */
export function extractMediaUrls(html: string, baseUrl: string): { favicon: string | null; favicons: string[]; ogImage: string | null } {
  const head = html.slice(0, 300_000);
  const resolve = (v: string | null) => {
    if (!v) return null;
    try {
      const u = new URL(v.trim().replace(/&amp;/g, '&'), baseUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      u.hash = '';
      return u.toString();
    } catch {
      return null;
    }
  };
  const icons: { url: string; score: number }[] = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(m[0], 'rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) continue;
    const url = resolve(attr(m[0], 'href'));
    if (!url) continue;
    const size = Number(/(\d+)x\d+/.exec(attr(m[0], 'sizes') ?? '')?.[1] ?? 0);
    const svg = /svg/i.test(attr(m[0], 'type') ?? '') || /\.svg(\?|$)/i.test(url);
    // What a tab needs is small and crisp: SVG first, then 32-64px, then 16-31px, then larger or unsized icons.
    // (A 192px PNG is often bigger than the size cap, so it must not outrank a 32px icon.)
    const score = (svg ? 1000 : size >= 32 && size <= 64 ? 800 : size >= 16 && size < 32 ? 600 : size > 64 ? 400 : 300) - (rel.includes('apple-touch-icon') ? 250 : 0);
    icons.push({ url, score });
  }
  const meta = (names: string[]): string | null => {
    for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
      const key = (attr(m[0], 'property') ?? attr(m[0], 'name') ?? '').toLowerCase();
      if (names.includes(key)) {
        const v = resolve(attr(m[0], 'content'));
        if (v) return v;
      }
    }
    return null;
  };
  const ordered = [...new Set([...icons.sort((a, b) => b.score - a.score).map((i) => i.url), resolve('/favicon.ico')].filter((u): u is string => !!u))];
  return { favicon: ordered[0] ?? null, favicons: ordered.slice(0, 3), ogImage: meta(['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']) };
}

/** Identify an image by its first bytes: servers mislabel favicons, and a label is not a reason to trust the content. */
export function sniffImage(b: Uint8Array): { mime: string; raster: boolean } | null {
  const s = (i: number, str: string) => str.split('').every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length < 4) return null;
  if (b[0] === 0x89 && s(1, 'PNG')) return { mime: 'image/png', raster: true };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', raster: true };
  if (s(0, 'GIF8')) return { mime: 'image/gif', raster: true };
  if (s(0, 'RIFF') && s(8, 'WEBP')) return { mime: 'image/webp', raster: true };
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return { mime: 'image/x-icon', raster: false };
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?<svg\b/i.test(new TextDecoder().decode(b.slice(0, 600)))) return { mime: 'image/svg+xml', raster: false };
  return null;
}

async function fetchImage(url: string | null, opts: SafeFetchOptions, maxBytes: number, rasterOnly: boolean): Promise<MediaFile | null> {
  if (!url) return null;
  try {
    const r = await safeFetch(url, { ...opts, binary: true, accept: 'image/*,*/*;q=0.5', maxBytes, timeoutMs: 8000 });
    if (r.status !== 200 || !r.bytes || r.truncated || r.bytes.length === 0) return null;
    const kind = sniffImage(r.bytes);
    if (!kind || (rasterOnly && !kind.raster)) return null;
    return { url, contentType: kind.mime, size: r.bytes.length, base64: Buffer.from(r.bytes).toString('base64') };
  } catch {
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

  const mediaUrls = extractMediaUrls(html, finalUrl);
  const ctx = { discoveredScripts: new Set(scriptUrls), wordpress: wp.detected, discoveredCmsFiles: cmsFiles, discoveredMedia: new Set([...mediaUrls.favicons, mediaUrls.ogImage].filter((u): u is string => !!u)) };
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

  // What the site shows in a tab and in a shared link: a favicon (64 KB cap) and a raster share image (600 KB cap).
  const firstIcon = async () => {
    for (const u of mediaUrls.favicons) {
      const f = await fetchImage(u, o, 64 * 1024, false);
      if (f) return f;
    }
    return null;
  };
  const [favicon, ogImage] = await Promise.all([firstIcon(), fetchImage(mediaUrls.ogImage, o, 600 * 1024, true)]);

  return { robots, sitemap, securityTxt, adsTxt, llmsTxt, scripts, cms, media: { favicon, ogImage } };
}
