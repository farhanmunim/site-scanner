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
  detected: boolean;
  themeSlugs: string[];
  pluginSlugs: string[];
}

/** Find WordPress theme/plugin slugs referenced by the page (paths only, no guessing). */
export function extractWordPressRefs(html: string): WordPressRefs {
  const themes = new Set<string>();
  const plugins = new Set<string>();
  const re = /\/wp-content\/(themes|plugins)\/([a-z0-9_-]+)\//gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    (m[1]!.toLowerCase() === 'themes' ? themes : plugins).add(m[2]!.toLowerCase());
  }
  const detected = themes.size > 0 || plugins.size > 0 || /\/wp-includes\/|wp-json|<meta name="generator" content="WordPress/i.test(html);
  return { detected, themeSlugs: [...themes], pluginSlugs: [...plugins].slice(0, LIMITS.maxPluginReadmes) };
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
export async function gatherFiles(html: string, finalUrl: string, opts: SafeFetchOptions): Promise<FilesStageData> {
  const origin = new URL(finalUrl).origin;
  const host = new URL(finalUrl).hostname;
  const scriptUrls = extractScriptUrls(html, finalUrl);
  const wp = extractWordPressRefs(html);

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
