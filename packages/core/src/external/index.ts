import { promises as dnsPromises } from 'node:dns';
import { parse as parseDomain } from 'tldts';
import { dohQuery } from '../gather/doh.js';
import { identifyLibraries, normaliseRepo, type RetireRepoEntry } from './retire.js';
import type { BlocklistData, BlocklistHit, DnsRecords, ExternalData, IpInfo, PsiMetrics, RetireLibrary, SafeBrowsingData, SubdomainData, WordfenceVuln } from '../types.js';

export * from './retire.js';

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
  retire?: boolean;
  blocklists?: boolean;
  propagation?: boolean;
  /** Test hook: true = resolves, false = definitely does not, null = could not tell. */
  resolveName?: (name: string) => Promise<boolean | null>;
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

export interface WordfenceItem {
  type: 'plugin' | 'theme' | 'core';
  slug: string;
}

const wfKey = (i: WordfenceItem) => `${i.type}:${i.slug}`;

/**
 * Wordfence Intelligence vulnerability feed (free, no key). The feed is tens of MB, so it is only
 * downloaded when a requested component is not already cached; results are cached per component
 * (an empty list is a real answer: "no advisories").
 */
export async function fetchWordfence(items: WordfenceItem[], cfg: ExternalConfig): Promise<Record<string, WordfenceVuln[]>> {
  const out: Record<string, WordfenceVuln[]> = {};
  if (cfg.wordpress === false || items.length === 0) return out;
  const missing: WordfenceItem[] = [];
  for (const i of items) {
    const hit = cfg.cache ? await cfg.cache.get<WordfenceVuln[]>(`wordfence2:${wfKey(i)}`).catch(() => undefined) : undefined;
    if (hit) out[wfKey(i)] = hit;
    else missing.push(i);
  }
  if (!missing.length) return out;
  const f = cfg.fetchImpl ?? fetch;
  const res = await f('https://www.wordfence.com/api/intelligence/v2/vulnerabilities/production', { signal: AbortSignal.timeout(90_000) }).catch(() => null);
  if (!res?.ok) return out;
  const j = (await res.json().catch(() => null)) as Record<string, WordfenceRecord> | null;
  if (!j) return out;
  const want = new Map(missing.map((i) => [wfKey(i), [] as WordfenceVuln[]]));
  for (const v of Object.values(j)) {
    for (const sw of v.software ?? []) {
      const key = `${sw.type}:${sw.slug}`;
      const bucket = want.get(key);
      if (!bucket) continue;
      bucket.push({
        title: v.title ?? 'Untitled advisory',
        cve: v.cve ?? null,
        cvss: typeof v.cvss?.score === 'number' ? v.cvss.score : null,
        ranges: Object.values(sw.affected_versions ?? {}).map((r) => ({ from: r.from_version && r.from_version !== '*' ? r.from_version : null, fromInclusive: r.from_inclusive !== false, to: r.to_version && r.to_version !== '*' ? r.to_version : null, toInclusive: r.to_inclusive !== false })),
        patched: sw.patched_versions ?? [],
        patchedFlag: !!sw.patched
      });
    }
  }
  for (const [key, list] of want) {
    out[key] = list;
    if (cfg.cache) await cfg.cache.set(`wordfence2:${key}`, list, 24 * 3600).catch(() => {});
  }
  return out;
}

interface WordfenceRecord {
  title?: string;
  cve?: string | null;
  cvss?: { score?: number };
  software?: { type?: string; slug?: string; patched?: boolean; patched_versions?: string[]; affected_versions?: Record<string, { from_version?: string; from_inclusive?: boolean; to_version?: string; to_inclusive?: boolean }> }[];
}

/** Latest stable WordPress release. */
export async function fetchWordPressLatest(cfg: ExternalConfig): Promise<string | null> {
  if (cfg.wordpress === false) return null;
  return cached(cfg, 'wp-latest', 6 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    const res = await f('https://api.wordpress.org/core/version-check/1.7/', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { offers?: { response?: string; version?: string }[] };
    return j.offers?.find((o) => o.response === 'upgrade' || !o.response)?.version ?? j.offers?.[0]?.version ?? null;
  });
}

export async function fetchWordPressThemes(slugs: string[], cfg: ExternalConfig): Promise<NonNullable<ExternalData['wordpressThemes']>> {
  const out: NonNullable<ExternalData['wordpressThemes']> = {};
  if (cfg.wordpress === false) return out;
  const f = cfg.fetchImpl ?? fetch;
  await Promise.all(
    slugs.slice(0, 3).map(async (slug) => {
      const v = await cached(cfg, `wptheme:${slug}`, 24 * 3600, async () => {
        const res = await f(`https://api.wordpress.org/themes/info/1.2/?action=theme_information&request[slug]=${encodeURIComponent(slug)}&request[fields][sections]=0`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const j = (await res.json()) as { name?: string; version?: string; last_updated?: string; error?: string };
        if (j.error || !j.name) return null;
        return { name: j.name, version: j.version ?? null, lastUpdated: j.last_updated ? normaliseWpDate(j.last_updated) : null };
      });
      if (v) out[slug] = v;
    })
  );
  return out;
}

/** retire.js repository, trimmed to the libraries that appear on this page (the full file is ~1 MB). */
export async function fetchRetire(urls: string[], bodies: { source: string; body: string }[], cfg: ExternalConfig): Promise<RetireLibrary[] | null> {
  if (cfg.retire === false) return null;
  const repo = await cached(cfg, 'retire:repo', 24 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    const res = await f('https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository.json', { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return normaliseRepo((await res.json()) as Record<string, RetireRepoEntry>);
  });
  if (!repo) return null;
  const hit = new Set(identifyLibraries(repo, urls, bodies).map((m) => m.library));
  return repo.filter((l) => hit.has(l.name));
}

const BLOCKLISTS = ['zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org', 'psbl.surriel.com', 'dnsbl-1.uceprotect.net', 'dnsbl.dronebl.org', 'all.s5h.net'];
const CDN_ASN = /cloudflare|fastly|akamai|cloudfront|incapsula|imperva|sucuri|stackpath/i;

/** Reverse an IPv4 address for DNSBL lookups; null for anything else. */
export function dnsblName(ip: string, zone: string): string | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  return m ? `${m[4]}.${m[3]}.${m[2]}.${m[1]}.${zone}` : null;
}

/**
 * Check the site's own IPs (skipped behind a CDN) and its mail servers against public DNS blocklists.
 * Several lists refuse queries from big public resolvers (127.255.255.x): those count as unavailable,
 * never as "clean".
 */
export async function fetchBlocklists(dns: DnsRecords | null, ips: IpInfo[], cfg: ExternalConfig, query: (name: string) => Promise<{ status: number; answers: string[] } | null> = defaultDnsblQuery): Promise<BlocklistData | null> {
  if (cfg.blocklists === false || !dns) return null;
  const subjects = new Map<string, 'web' | 'mail'>();
  for (const ip of ips) if (ip.version === 4 && !CDN_ASN.test(ip.asnOrg ?? '')) subjects.set(ip.ip, 'web');
  const mxHosts = dns.MX.slice(0, 3).map((m) => m.exchange).filter(Boolean);
  const mxIps = await Promise.all(mxHosts.map((h) => dohQuery(h, 'A').then((r) => r.answers.map((a) => a.data)).catch(() => [] as string[])));
  for (const ip of mxIps.flat().slice(0, 6)) subjects.set(ip, 'mail');
  const checked = [...subjects].slice(0, 8).map(([ip, role]) => ({ ip, role }));
  if (!checked.length) return { checkedAt: new Date().toISOString(), checked, lists: BLOCKLISTS, listed: [], unavailable: [] };
  const listed: BlocklistHit[] = [];
  const unavailable = new Set<string>();
  await Promise.all(
    checked.flatMap(({ ip, role }) =>
      BLOCKLISTS.map(async (zone) => {
        const name = dnsblName(ip, zone);
        if (!name) return;
        const r = await query(name).catch(() => null);
        if (!r || (r.status !== 0 && r.status !== 3)) return void unavailable.add(zone);
        const code = r.answers.find((a) => a.startsWith('127.'));
        if (!code) return;
        if (code.startsWith('127.255.255.')) return void unavailable.add(zone);
        listed.push({ list: zone, subject: ip, role, code });
      })
    )
  );
  return { checkedAt: new Date().toISOString(), checked, lists: BLOCKLISTS, listed, unavailable: [...unavailable] };
}

async function defaultDnsblQuery(name: string): Promise<{ status: number; answers: string[] } | null> {
  const r = await dohQuery(name, 'A');
  return { status: r.status, answers: r.answers.map((a) => a.data) };
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

const NO_RECORD = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

/** True when the name has an address or alias record, false when DNS says it does not exist, null when unsure. */
export async function nameResolves(name: string, timeoutMs = 4000): Promise<boolean | null> {
  const attempt = Promise.any([dnsPromises.resolve4(name), dnsPromises.resolve6(name), dnsPromises.resolveCname(name)]).then(() => true as const);
  const timer = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs).unref?.());
  try {
    return await Promise.race([attempt, timer]);
  } catch (e) {
    const errs = (e as AggregateError).errors ?? [e];
    return errs.every((x: { code?: string }) => NO_RECORD.has(x?.code ?? '')) ? false : null;
  }
}

/** Split names into those that resolve now and those that do not, within a time budget. */
async function checkLive(domain: string, names: string[], cfg: ExternalConfig): Promise<Pick<SubdomainData, 'live' | 'wildcard' | 'unverified'>> {
  const resolve = cfg.resolveName ?? ((n: string) => nameResolves(n));
  // A wildcard record makes every name resolve; then resolving proves nothing.
  if ((await resolve(`zz-${Math.random().toString(36).slice(2, 10)}.${domain}`)) === true) return { wildcard: true };
  const deadline = Date.now() + 15_000;
  const live: string[] = [];
  let unverified = 0;
  let next = 0;
  const worker = async () => {
    while (next < names.length) {
      const n = names[next++]!;
      if (Date.now() > deadline) {
        unverified++;
        continue;
      }
      const r = await resolve(n).catch(() => null);
      if (r === true) live.push(n);
      else if (r === null) unverified++;
    }
  };
  await Promise.all(Array.from({ length: 25 }, worker));
  const order = new Map(names.map((n, i) => [n, i]));
  live.sort((a, b) => order.get(a)! - order.get(b)!);
  return { live, unverified };
}

/**
 * Passive subdomain discovery. Tries Certificate Transparency (crt.sh, with a retry), then
 * Certspotter, then HackerTarget's passive DNS, and stops at the first that answers: crt.sh
 * alone is too flaky to depend on. It never contacts the target and cannot prove a name
 * still resolves. Returns null only when every source failed (failures are not cached).
 */
export async function fetchSubdomains(registrableDomain: string, cfg: ExternalConfig): Promise<SubdomainData | null> {
  if (cfg.subdomains === false) return null;
  return cached(cfg, `subdomains3:${registrableDomain}`, 24 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    for (const src of SUBDOMAIN_SOURCES) {
      const raw = await src.fetch(registrableDomain, f).catch(() => null);
      if (!raw) continue;
      const { names, total } = collectSubdomains(raw, registrableDomain);
      return { checkedAt: new Date().toISOString(), source: src.id, names, total, ...(await checkLive(registrableDomain, names, cfg)) };
    }
    return null;
  });
}
