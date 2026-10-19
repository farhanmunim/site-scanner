import { parse as parseDomain } from 'tldts';
import type { ExternalData, PsiMetrics, SafeBrowsingData, SubdomainData } from '../types.js';

/**
 * Optional free enrichment APIs. Every function returns null (never throws) when the key
 * is missing or the API fails; the report then simply omits that section. Callers should
 * cache results (see apps/worker) so a popular domain doesn't burn quota.
 */

export interface ExternalConfig {
  googleApiKey?: string;
  psi?: boolean;
  safeBrowsing?: boolean;
  wordpress?: boolean;
  wayback?: boolean;
  greenWeb?: boolean;
  subdomains?: boolean;
  fetchImpl?: typeof fetch;
  /** Cache: get/set JSON by key with TTL seconds. */
  cache?: { get<T>(key: string): Promise<T | null | undefined>; set(key: string, value: unknown, ttlSec: number): Promise<void> };
}

async function cached<T>(cfg: ExternalConfig, key: string, ttlSec: number, fn: () => Promise<T | null>): Promise<T | null> {
  if (cfg.cache) {
    const hit = await cfg.cache.get<T>(key).catch(() => undefined);
    if (hit !== undefined) return hit;
  }
  const v = await fn().catch(() => null);
  if (cfg.cache && v !== null) await cfg.cache.set(key, v, ttlSec).catch(() => {});
  return v;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export async function fetchPsi(url: string, strategy: 'mobile' | 'desktop', cfg: ExternalConfig): Promise<PsiMetrics | null> {
  if (!cfg.googleApiKey || cfg.psi === false) return null;
  return cached(cfg, `psi2:${strategy}:${url}`, 6 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    const u = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    u.searchParams.set('url', url);
    u.searchParams.set('strategy', strategy);
    for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) u.searchParams.append('category', c);
    u.searchParams.set('key', cfg.googleApiKey!);
    const res = await f(u.toString(), { signal: AbortSignal.timeout(75_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as PsiResponse;
    const lh = j.lighthouseResult;
    if (!lh) return null;
    const a = lh.audits ?? {};
    const cat = lh.categories ?? {};
    const score = (k: string) => (num(cat[k]?.score) !== null ? Math.round(cat[k]!.score! * 100) : null);
    const ms = (k: string) => num(a[k]?.numericValue);
    const fieldM = j.loadingExperience?.metrics;
    const field = fieldM
      ? {
          lcpMs: num(fieldM.LARGEST_CONTENTFUL_PAINT_MS?.percentile),
          cls: fieldM.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile !== undefined ? fieldM.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
          inpMs: num(fieldM.INTERACTION_TO_NEXT_PAINT?.percentile),
          ttfbMs: num(fieldM.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile),
          overall: j.loadingExperience?.overall_category ?? null
        }
      : null;
    const a11y = Object.values(a)
      .filter((x) => x && x.score !== null && x.score !== undefined && x.score < 1 && x.id && (lh.categories?.accessibility?.auditRefs ?? []).some((r) => r.id === x.id))
      .map((x) => ({ id: x.id!, title: x.title ?? x.id!, count: x.details?.items?.length ?? 1 }))
      .slice(0, 15);
    return {
      strategy,
      fetchedAt: new Date().toISOString(),
      lighthouseVersion: lh.lighthouseVersion ?? null,
      scores: { performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo') },
      lab: { lcpMs: ms('largest-contentful-paint'), cls: ms('cumulative-layout-shift'), tbtMs: ms('total-blocking-time'), fcpMs: ms('first-contentful-paint'), speedIndexMs: ms('speed-index'), ttiMs: ms('interactive'), ttfbMs: ms('server-response-time') },
      field,
      screenshotDataUrl: a['final-screenshot']?.details?.data ?? null,
      accessibilityIssues: a11y,
      totalBytes: num(a['total-byte-weight']?.numericValue),
      requestCount: a['network-requests']?.details?.items?.length ?? null,
      breakdown: resourceBreakdown(a, lh.finalDisplayedUrl ?? lh.finalUrl ?? url)
    };
  });
}

type ResItem = { resourceType?: string; transferSize?: number; url?: string };

/** Bytes by resource type from Lighthouse's resource-summary, else derived from network-requests. */
export function resourceBreakdown(a: NonNullable<NonNullable<PsiResponse['lighthouseResult']>['audits']>, finalUrl: string): PsiMetrics['breakdown'] {
  const out = { scriptBytes: null, imageBytes: null, fontBytes: null, stylesheetBytes: null, documentBytes: null, thirdPartyBytes: null, otherBytes: null } as NonNullable<PsiMetrics['breakdown']>;
  const key = (t: string | undefined): keyof typeof out | null => {
    switch ((t ?? '').toLowerCase()) {
      case 'script':
        return 'scriptBytes';
      case 'image':
        return 'imageBytes';
      case 'font':
        return 'fontBytes';
      case 'stylesheet':
        return 'stylesheetBytes';
      case 'document':
        return 'documentBytes';
      case 'third-party':
        return 'thirdPartyBytes';
      case 'total':
        return null;
      default:
        return 'otherBytes';
    }
  };
  const summary = a['resource-summary']?.details?.items as ResItem[] | undefined;
  if (summary?.length) {
    for (const it of summary) {
      const k = key(it.resourceType);
      if (!k || typeof it.transferSize !== 'number') continue;
      out[k] = (out[k] ?? 0) + it.transferSize;
    }
    return out;
  }
  const reqs = a['network-requests']?.details?.items as ResItem[] | undefined;
  if (!reqs?.length) return null;
  const own = parseDomain(finalUrl).domain;
  let third = 0;
  for (const it of reqs) {
    if (typeof it.transferSize !== 'number') continue;
    const k = key(it.resourceType) ?? 'otherBytes';
    if (k !== 'thirdPartyBytes') out[k] = (out[k] ?? 0) + it.transferSize;
    if (it.url && own && parseDomain(it.url).domain !== own) third += it.transferSize;
  }
  out.thirdPartyBytes = third;
  return out;
}

export interface PsiResponse {
  lighthouseResult?: {
    lighthouseVersion?: string;
    finalDisplayedUrl?: string;
    finalUrl?: string;
    categories?: Record<string, { score?: number | null; auditRefs?: { id: string }[] }>;
    audits?: Record<string, { id?: string; title?: string; score?: number | null; numericValue?: number; details?: { data?: string; items?: unknown[] } }>;
  };
  loadingExperience?: { overall_category?: string; metrics?: Record<string, { percentile: number }> };
}

export async function fetchSafeBrowsing(url: string, cfg: ExternalConfig): Promise<SafeBrowsingData | null> {
  if (!cfg.googleApiKey || cfg.safeBrowsing === false) return null;
  return cached(cfg, `gsb:${url}`, 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    const res = await f(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${cfg.googleApiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'site-scan', clientVersion: '1.0' },
        threatInfo: { threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'], platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'], threatEntries: [{ url }] }
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { matches?: { threatType: string }[] };
    return { checkedAt: new Date().toISOString(), threats: [...new Set((j.matches ?? []).map((m) => m.threatType))] };
  });
}

export async function fetchWordPressOrg(slugs: string[], cfg: ExternalConfig): Promise<NonNullable<ExternalData['wordpressOrg']>> {
  const out: NonNullable<ExternalData['wordpressOrg']> = {};
  if (cfg.wordpress === false) return out;
  const f = cfg.fetchImpl ?? fetch;
  await Promise.all(
    slugs.slice(0, 12).map(async (slug) => {
      const v = await cached(cfg, `wporg:${slug}`, 24 * 3600, async () => {
        const res = await f(`https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=${encodeURIComponent(slug)}&request[fields][sections]=0&request[fields][description]=0&request[fields][banners]=0&request[fields][screenshots]=0`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const j = (await res.json()) as { name?: string; version?: string; last_updated?: string; active_installs?: number; tested?: string; error?: string };
        if (j.error || !j.name) return { name: slug, version: null, lastUpdated: null, activeInstalls: null, tested: null, notInDirectory: true };
        return { name: j.name.replace(/&#8211;/g, '–').replace(/&amp;/g, '&'), version: j.version ?? null, lastUpdated: j.last_updated ? normaliseWpDate(j.last_updated) : null, activeInstalls: j.active_installs ?? null, tested: j.tested ?? null };
      });
      if (v && !(v as { notInDirectory?: boolean }).notInDirectory) out[slug] = v;
    })
  );
  return out;
}

function normaliseWpDate(s: string): string | null {
  // "2025-08-11 3:04pm GMT"
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1]! : null;
}

/** Wordfence Intelligence vulnerability feed (free, no key). Large (~tens of MB): cache for a day. */
export async function fetchWordfence(slugs: string[], cfg: ExternalConfig): Promise<NonNullable<ExternalData['wordfence']>> {
  const out: NonNullable<ExternalData['wordfence']> = {};
  if (cfg.wordpress === false || slugs.length === 0) return out;
  const index = await cached(cfg, 'wordfence:index', 24 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    const res = await f('https://www.wordfence.com/api/intelligence/v2/vulnerabilities/production', { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, { title?: string; software?: { type?: string; slug?: string; affected_versions?: Record<string, { to_version?: string; patched?: boolean; patched_versions?: string[] }> }[] }>;
    const idx: Record<string, { count: number; latestTitle: string | null; affectedBelow: string | null }> = {};
    for (const v of Object.values(j)) {
      for (const sw of v.software ?? []) {
        if (sw.type !== 'plugin' || !sw.slug) continue;
        const cur = (idx[sw.slug] ??= { count: 0, latestTitle: null, affectedBelow: null });
        cur.count++;
        cur.latestTitle ??= v.title ?? null;
        const patched = Object.values(sw.affected_versions ?? {}).flatMap((a) => a.patched_versions ?? []);
        if (patched.length) cur.affectedBelow = patched.sort().at(-1) ?? cur.affectedBelow;
      }
    }
    return idx;
  });
  if (!index) return out;
  for (const s of slugs) if (index[s]) out[s] = index[s]!;
  return out;
}

export async function fetchWayback(host: string, cfg: ExternalConfig): Promise<{ firstSeen: string | null } | null> {
  if (cfg.wayback === false) return null;
  return cached(cfg, `wayback:${host}`, 7 * 24 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    // The CDX index is slow and occasionally resets connections: allow longer and retry once.
    const res = await getWithRetry(f, `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(host)}&limit=1&fl=timestamp&filter=statuscode:200`, 20_000, 2);
    if (!res) return null;
    const t = (await res.text()).trim().split('\n')[0];
    if (!t || !/^\d{8}/.test(t)) return { firstSeen: null };
    return { firstSeen: `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` };
  });
}

export async function fetchGreenWeb(host: string, cfg: ExternalConfig): Promise<{ green: boolean; hostedBy: string | null } | null> {
  if (cfg.greenWeb === false) return null;
  return cached(cfg, `green:${host}`, 7 * 24 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    const res = await f(`https://api.thegreenwebfoundation.org/api/v3/greencheck/${encodeURIComponent(host)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { green?: boolean; hosted_by?: string };
    return { green: !!j.green, hostedBy: j.hosted_by ?? null };
  });
}

export const SUBDOMAIN_CAP = 200;

/** Reduce raw CT-log name values to distinct hostnames under the registrable domain. */
export function collectSubdomains(nameValues: string[], registrableDomain: string): { names: string[]; total: number } {
  const d = registrableDomain.toLowerCase();
  const set = new Set<string>();
  for (const v of nameValues) {
    for (const raw of v.split(/\s+/)) {
      let n = raw.trim().toLowerCase().replace(/^\*\./, '');
      if (!n || n === d || !n.endsWith('.' + d)) continue;
      if (!/^[a-z0-9.-]+$/.test(n) || n.includes('..')) continue;
      set.add(n);
    }
  }
  const names = [...set].sort((a, b) => a.split('.').length - b.split('.').length || a.localeCompare(b));
  return { names: names.slice(0, SUBDOMAIN_CAP), total: names.length };
}

type SubdomainSource = NonNullable<SubdomainData['source']>;

async function getWithRetry(f: typeof fetch, url: string, timeoutMs: number, tries: number): Promise<Response | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await f(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      // Rate limited or overloaded: another attempt rarely helps for 4xx, often does for 5xx.
      if (res.status < 500) return null;
    } catch {
      /* timeout or network error: retry */
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

/** Each source returns raw hostnames (possibly several per entry) or null when it could not answer. */
const SUBDOMAIN_SOURCES: { id: SubdomainSource; fetch: (d: string, f: typeof fetch) => Promise<string[] | null> }[] = [
  {
    id: 'ct-log',
    async fetch(d, f) {
      const res = await getWithRetry(f, `https://crt.sh/?q=${encodeURIComponent('%.' + d)}&output=json`, 25_000, 2);
      if (!res) return null;
      const rows = (await res.json().catch(() => null)) as { name_value?: string }[] | null;
      return Array.isArray(rows) ? rows.map((r) => r.name_value ?? '') : null;
    }
  },
  {
    id: 'certspotter',
    async fetch(d, f) {
      const res = await getWithRetry(f, `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(d)}&include_subdomains=true&expand=dns_names`, 20_000, 1);
      if (!res) return null;
      const rows = (await res.json().catch(() => null)) as { dns_names?: string[] }[] | null;
      return Array.isArray(rows) ? rows.map((r) => (r.dns_names ?? []).join('\n')) : null;
    }
  },
  {
    id: 'hackertarget',
    async fetch(d, f) {
      const res = await getWithRetry(f, `https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(d)}`, 15_000, 1);
      if (!res) return null;
      const text = await res.text();
      if (/^error|API count exceeded/i.test(text.trim())) return null;
      return text.split('\n').map((l) => l.split(',')[0] ?? '');
    }
  }
];

/**
 * Passive subdomain discovery. Tries Certificate Transparency (crt.sh, with a retry), then
 * Certspotter, then HackerTarget's passive DNS, and stops at the first that answers: crt.sh
 * alone is too flaky to depend on. It never contacts the target and cannot prove a name
 * still resolves. Returns null only when every source failed (failures are not cached).
 */
export async function fetchSubdomains(registrableDomain: string, cfg: ExternalConfig): Promise<SubdomainData | null> {
  if (cfg.subdomains === false) return null;
  return cached(cfg, `subdomains2:${registrableDomain}`, 24 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    for (const src of SUBDOMAIN_SOURCES) {
      const raw = await src.fetch(registrableDomain, f).catch(() => null);
      if (!raw) continue;
      const { names, total } = collectSubdomains(raw, registrableDomain);
      return { checkedAt: new Date().toISOString(), source: src.id, names, total };
    }
    return null;
  });
}
