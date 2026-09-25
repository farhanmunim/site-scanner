import { parseHTML } from 'linkedom';
import type { DomQuery } from './detect/engine.js';

/**
 * Parsed view of the main document. linkedom gives a DOM (querySelector) without a
 * browser; everything derived here is used by detection, SEO and privacy audits.
 */
export interface ParsedHtml {
  dom: DomQuery;
  document: ReturnType<typeof parseHTML>['document'];
  meta: Record<string, string[]>;
  scriptSrc: string[];
  inlineScripts: string[];
  stylesheets: string[];
  links: { href: string; rel: string | null; nofollow: boolean }[];
  images: { src: string | null; alt: string | null }[];
  title: string | null;
  lang: string | null;
  canonical: string | null;
  jsonLd: unknown[];
  jsonLdErrors: string[];
  microdata: boolean;
  headings: Record<string, string[]>;
  favicon: string | null;
  manifest: string | null;
  hreflang: string[];
  forms: { action: string | null; method: string; hasPassword: boolean }[];
  iframes: string[];
  preconnects: string[];
  externalResourceHosts: Set<string>;
  /** Scripts with an integrity attribute vs external scripts without. */
  sri: { externalScripts: number; withIntegrity: number };
  mixedContent: number;
}

function abs(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

export function parseHtml(html: string, baseUrl: string): ParsedHtml {
  const { document } = parseHTML(html);
  const base = document.querySelector('base[href]')?.getAttribute('href');
  const baseResolved = abs(base, baseUrl) ?? baseUrl;
  const pageHost = new URL(baseUrl).hostname;
  const isHttps = baseUrl.startsWith('https://');

  const meta: Record<string, string[]> = {};
  for (const el of document.querySelectorAll('meta')) {
    const name = (el.getAttribute('name') ?? el.getAttribute('property') ?? el.getAttribute('http-equiv') ?? el.getAttribute('itemprop'))?.toLowerCase();
    const content = el.getAttribute('content');
    if (!name || content === null) continue;
    (meta[name] ??= []).push(content);
  }
  if (document.querySelector('meta[charset]')) meta['charset'] = [document.querySelector('meta[charset]')!.getAttribute('charset') ?? ''];

  const scriptSrc: string[] = [];
  const inlineScripts: string[] = [];
  let externalScripts = 0;
  let withIntegrity = 0;
  let mixedContent = 0;
  const externalResourceHosts = new Set<string>();
  const noteHost = (u: string | null) => {
    if (!u) return;
    const h = new URL(u).hostname;
    if (h !== pageHost) externalResourceHosts.add(h);
    if (isHttps && u.startsWith('http://')) mixedContent++;
  };
  for (const s of document.querySelectorAll('script')) {
    const src = abs(s.getAttribute('src'), baseResolved);
    if (src) {
      scriptSrc.push(src);
      noteHost(src);
      if (new URL(src).hostname !== pageHost) {
        externalScripts++;
        if (s.getAttribute('integrity')) withIntegrity++;
      }
    } else if (s.textContent && s.textContent.trim() && !/json/i.test(s.getAttribute('type') ?? '')) {
      inlineScripts.push(s.textContent.slice(0, 50_000));
    }
  }
  const stylesheets: string[] = [];
  for (const l of document.querySelectorAll('link[rel~="stylesheet"][href]')) {
    const href = abs(l.getAttribute('href'), baseResolved);
    if (href) {
      stylesheets.push(href);
      noteHost(href);
    }
  }
  for (const el of document.querySelectorAll('img[src], iframe[src], video[src], audio[src], source[src], link[rel="preload"][href]')) {
    noteHost(abs(el.getAttribute('src') ?? el.getAttribute('href'), baseResolved));
  }

  const links: ParsedHtml['links'] = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = abs(a.getAttribute('href'), baseResolved);
    if (!href) continue;
    const rel = a.getAttribute('rel');
    links.push({ href, rel, nofollow: /\bnofollow\b/i.test(rel ?? '') });
    if (links.length >= 2000) break;
  }
  const images: ParsedHtml['images'] = [];
  for (const img of document.querySelectorAll('img')) {
    images.push({ src: img.getAttribute('src'), alt: img.getAttribute('alt') });
    if (images.length >= 1000) break;
  }

  const jsonLd: unknown[] = [];
  const jsonLdErrors: string[] = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      jsonLd.push(JSON.parse(s.textContent ?? ''));
    } catch (e) {
      jsonLdErrors.push(`Invalid JSON-LD block: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  const headings: Record<string, string[]> = {};
  for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    headings[level] = [...document.querySelectorAll(level)].map((h) => (h.textContent ?? '').replace(/\s+/g, ' ').trim()).slice(0, 50);
  }

  const forms: ParsedHtml['forms'] = [];
  for (const f of document.querySelectorAll('form')) {
    forms.push({ action: abs(f.getAttribute('action'), baseResolved), method: (f.getAttribute('method') ?? 'get').toLowerCase(), hasPassword: !!f.querySelector('input[type="password"]') });
  }

  const iframes = [...document.querySelectorAll('iframe[src]')].map((i) => abs(i.getAttribute('src'), baseResolved)).filter((x): x is string => !!x);
  const preconnects = [...document.querySelectorAll('link[rel~="preconnect"][href], link[rel~="dns-prefetch"][href]')].map((l) => l.getAttribute('href') ?? '').filter(Boolean);

  return {
    dom: document as unknown as DomQuery,
    document,
    meta,
    scriptSrc: [...new Set(scriptSrc)],
    inlineScripts,
    stylesheets,
    links,
    images,
    title: document.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    lang: document.documentElement?.getAttribute('lang') ?? null,
    canonical: abs(document.querySelector('link[rel="canonical"]')?.getAttribute('href'), baseResolved),
    jsonLd,
    jsonLdErrors,
    microdata: !!document.querySelector('[itemscope]'),
    headings,
    favicon: abs(document.querySelector('link[rel~="icon"]')?.getAttribute('href'), baseResolved),
    manifest: abs(document.querySelector('link[rel="manifest"]')?.getAttribute('href'), baseResolved),
    hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute('hreflang') ?? '').filter(Boolean),
    forms,
    iframes,
    preconnects,
    externalResourceHosts,
    sri: { externalScripts, withIntegrity },
    mixedContent
  };
}
