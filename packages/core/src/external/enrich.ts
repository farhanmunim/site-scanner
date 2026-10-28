import type { CruxHistory, CruxPeriod, EolCycle, EolItem, ExternalData, GeoInfo, InternetDbData, InternetDbHost, OsvAdvisory, TrancoRank } from '../types.js';
import type { LibraryMatch } from './retire.js';
import type { ExternalConfig } from './index.js';

/**
 * Keyless enrichment: public datasets that need no account. Same contract as the rest of
 * external/: never throw, return null when the source is unavailable, and cache.
 */

async function cached<T>(cfg: ExternalConfig, key: string, ttlSec: number, fn: () => Promise<T | null>): Promise<T | null> {
  if (cfg.cache) {
    const hit = await cfg.cache.get<T>(key).catch(() => undefined);
    if (hit !== undefined) return hit;
  }
  const v = await fn().catch(() => null);
  if (cfg.cache && v !== null) await cfg.cache.set(key, v, ttlSec).catch(() => {});
  return v;
}

const JSON_ACCEPT = { accept: 'application/json' };

// ---------------------------------------------------------------------------
// Shodan InternetDB: free, no key. What an internet-wide scanner already saw on an IP.
// ---------------------------------------------------------------------------

export async function fetchInternetDb(ips: string[], cfg: ExternalConfig): Promise<InternetDbData | null> {
  if (cfg.internetDb === false || !ips.length) return null;
  const f = cfg.fetchImpl ?? fetch;
  const list = [...new Set(ips)].slice(0, 4);
  const hosts = await Promise.all(
    list.map((ip) =>
      cached<InternetDbHost>(cfg, `idb:${ip}`, 12 * 3600, async () => {
        const res = await f(`https://internetdb.shodan.io/${encodeURIComponent(ip)}`, { headers: JSON_ACCEPT, signal: AbortSignal.timeout(8000) });
        if (res.status === 404) return { ip, known: false, ports: [], vulns: [], cpes: [], hostnames: [], tags: [] };
        if (!res.ok) return null;
        const j = (await res.json()) as { ports?: unknown; vulns?: unknown; cpes?: unknown; hostnames?: unknown; tags?: unknown };
        const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);
        const ports = Array.isArray(j.ports) ? j.ports.filter((p): p is number => Number.isInteger(p) && p > 0 && p < 65536).sort((a, b) => a - b).slice(0, 60) : [];
        return { ip, known: true, ports, vulns: strs(j.vulns, 50), cpes: strs(j.cpes, 20), hostnames: strs(j.hostnames, 10), tags: strs(j.tags, 10) };
      })
    )
  );
  const ok = hosts.filter((h): h is InternetDbHost => !!h);
  return ok.length ? { checkedAt: new Date().toISOString(), hosts: ok } : null;
}

// ---------------------------------------------------------------------------
// endoflife.date: free, no key. Support status of detected software versions.
// ---------------------------------------------------------------------------

/** Detected technology name -> endoflife.date product slug. */
export const EOL_PRODUCTS: Record<string, string> = {
  PHP: 'php',
  WordPress: 'wordpress',
  'Node.js': 'nodejs',
  Nginx: 'nginx',
  nginx: 'nginx',
  'Apache HTTP Server': 'apache-http-server',
  Drupal: 'drupal',
  Joomla: 'joomla',
  Laravel: 'laravel',
  Symfony: 'symfony',
  Django: 'django',
  'Ruby on Rails': 'ruby-on-rails',
  Magento: 'magento',
  Bootstrap: 'bootstrap',
  AngularJS: 'angularjs',
  Angular: 'angular',
  'Vue.js': 'vue',
  'React': 'react',
  'Next.js': 'nextjs',
  'Nuxt.js': 'nuxt',
  jQuery: 'jquery',
  'jQuery UI': 'jquery-ui',
  Python: 'python',
  Ruby: 'ruby',
  'ASP.NET': 'dotnet',
  '.NET': 'dotnet',
  MySQL: 'mysql',
  PostgreSQL: 'postgresql',
  Ubuntu: 'ubuntu',
  Debian: 'debian',
  CentOS: 'centos',
  'Microsoft IIS': 'iis',
  Tomcat: 'tomcat',
  'Apache Tomcat': 'tomcat',
  Varnish: 'varnish',
  Moodle: 'moodle',
  TYPO3: 'typo3',
  Umbraco: 'umbraco'
};

/** The release cycle a version belongs to: the longest cycle string that is a prefix of the version. */
export function matchCycle(cycles: EolCycle[], version: string): EolCycle | null {
  const v = version.replace(/^v/i, '');
  let best: EolCycle | null = null;
  for (const c of cycles) {
    const cy = String(c.cycle);
    if ((v === cy || v.startsWith(cy + '.') || v.startsWith(cy + '-')) && (!best || cy.length > String(best.cycle).length)) best = c;
  }
  return best;
}

export function toEolItem(technology: string, product: string, version: string, c: EolCycle, now = new Date()): EolItem {
  const eol = typeof c.eol === 'string' ? c.eol : false;
  const supported = c.eol === true ? false : eol ? Date.parse(eol) > now.getTime() : true;
  return { technology, product, version, cycle: String(c.cycle), eol: c.eol === true ? 'ended' : eol, latest: c.latest ?? null, lts: !!c.lts, supported };
}

/** Pure: match detected versions against fetched release tables. */
export function evaluateEol(techs: { name: string; version: string | null }[], tables: Record<string, EolCycle[]> | null | undefined, now = new Date()): EolItem[] {
  if (!tables) return [];
  const out: EolItem[] = [];
  const seen = new Set<string>();
  for (const t of techs) {
    const product = EOL_PRODUCTS[t.name];
    const cycles = product ? tables[product] : undefined;
    if (!product || !cycles || !t.version || !/^\d/.test(t.version) || seen.has(product)) continue;
    const c = matchCycle(cycles, t.version);
    if (!c) continue;
    seen.add(product);
    out.push(toEolItem(t.name, product, t.version, c, now));
  }
  return out;
}

/** Products worth fetching for this page: a few that nearly every site could run, plus any named in its headers or markup. */
export function eolProductsFor(haystack: string): string[] {
  const h = haystack.toLowerCase();
  const always = ['php', 'wordpress', 'nodejs', 'nginx', 'apache-http-server'];
  const hints: [string, string][] = [['drupal', 'drupal'], ['joomla', 'joomla'], ['laravel', 'laravel'], ['symfony', 'symfony'], ['django', 'django'], ['rails', 'ruby-on-rails'], ['magento', 'magento'], ['bootstrap', 'bootstrap'], ['angular', 'angular'], ['vue', 'vue'], ['next', 'nextjs'], ['nuxt', 'nuxt'], ['jquery', 'jquery'], ['moodle', 'moodle'], ['typo3', 'typo3'], ['asp.net', 'dotnet'], ['tomcat', 'tomcat'], ['iis', 'iis'], ['varnish', 'varnish'], ['ubuntu', 'ubuntu'], ['debian', 'debian']];
  return [...new Set([...always, ...hints.filter(([k]) => h.includes(k)).map(([, p]) => p)])].slice(0, 12);
}

export async function fetchEolTables(products: string[], cfg: ExternalConfig): Promise<Record<string, EolCycle[]> | null> {
  if (cfg.eol === false || !products.length) return null;
  const f = cfg.fetchImpl ?? fetch;
  const entries = await Promise.all(
    products.map(async (product) => {
      const cycles = await cached<EolCycle[]>(cfg, `eol2:${product}`, 24 * 3600, async () => {
        const res = await f(`https://endoflife.date/api/${encodeURIComponent(product)}.json`, { headers: JSON_ACCEPT, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const j = (await res.json()) as unknown;
        // Keep only what matching needs: the raw tables carry dates and links for every release.
        return Array.isArray(j) ? (j as EolCycle[]).slice(0, 60).map((c) => ({ cycle: String(c.cycle), eol: c.eol, latest: c.latest, lts: c.lts })) : null;
      });
      return [product, cycles] as const;
    })
  );
  const out: Record<string, EolCycle[]> = {};
  for (const [p, c] of entries) if (c) out[p] = c;
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------
// OSV.dev: free, no key. Advisories for npm packages by exact version.
// ---------------------------------------------------------------------------

/** retire.js library name -> npm package name, where they differ. */
const NPM_NAMES: Record<string, string> = { angularjs: 'angular', 'jquery-ui': 'jquery-ui', 'jquery-migrate': 'jquery-migrate', bootstrap: 'bootstrap', 'lodash.js': 'lodash', underscore: 'underscore', 'moment.js': 'moment', 'handlebars.js': 'handlebars', 'vue': 'vue', 'react': 'react' };

interface OsvVuln {
  id: string;
  aliases?: string[];
  summary?: string;
  database_specific?: { severity?: string };
  affected?: { ranges?: { events?: { introduced?: string; fixed?: string }[] }[] }[];
}

export async function fetchOsv(libs: LibraryMatch[], cfg: ExternalConfig): Promise<Record<string, OsvAdvisory[]> | null> {
  if (cfg.osv === false) return null;
  const f = cfg.fetchImpl ?? fetch;
  const uniq = new Map<string, LibraryMatch>();
  for (const l of libs) uniq.set(`${l.library}@${l.version}`, l);
  if (!uniq.size) return {};
  const entries = await Promise.all(
    [...uniq.entries()].slice(0, 8).map(async ([key, l]) => {
      const name = NPM_NAMES[l.library.toLowerCase()] ?? l.library.toLowerCase();
      const advisories = await cached<OsvAdvisory[]>(cfg, `osv:${name}@${l.version}`, 24 * 3600, async () => {
        const res = await f('https://api.osv.dev/v1/query', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ package: { name, ecosystem: 'npm' }, version: l.version }), signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;
        const j = (await res.json()) as { vulns?: OsvVuln[] };
        return (j.vulns ?? []).slice(0, 12).map((v) => ({
          id: v.id,
          aliases: (v.aliases ?? []).slice(0, 6),
          summary: v.summary?.slice(0, 200) ?? null,
          severity: v.database_specific?.severity?.toLowerCase() ?? null,
          fixedIn: v.affected?.flatMap((a) => a.ranges?.flatMap((r) => r.events?.map((e) => e.fixed).filter((x): x is string => !!x) ?? []) ?? [])[0] ?? null
        }));
      });
      return [key, advisories] as const;
    })
  );
  const out: Record<string, OsvAdvisory[]> = {};
  let any = false;
  for (const [k, v] of entries) if (v) ((out[k] = v), (any = true));
  return any || !entries.length ? out : null;
}

// ---------------------------------------------------------------------------
// Tranco: free, no key. How popular is the domain (top 1M sites).
// ---------------------------------------------------------------------------

export async function fetchTranco(registrableDomain: string, cfg: ExternalConfig): Promise<TrancoRank | null> {
  if (cfg.tranco === false) return null;
  const f = cfg.fetchImpl ?? fetch;
  return cached(cfg, `tranco:${registrableDomain}`, 24 * 3600, async () => {
    const res = await f(`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(registrableDomain)}`, { headers: JSON_ACCEPT, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { ranks?: { rank?: number | null }[] };
    const ranks = (j.ranks ?? []).map((r) => r.rank).filter((r): r is number => typeof r === 'number' && r > 0);
    return { rank: ranks[0] ?? null, best: ranks.length ? Math.min(...ranks) : null, days: (j.ranks ?? []).length };
  });
}

// ---------------------------------------------------------------------------
// ipwho.is: free, no key. City and region for the primary IP (country and ASN come from DNS-time lookups).
// ---------------------------------------------------------------------------

export async function fetchGeo(ip: string | null | undefined, cfg: ExternalConfig): Promise<GeoInfo | null> {
  if (cfg.geo === false || !ip) return null;
  const f = cfg.fetchImpl ?? fetch;
  return cached(cfg, `geo:${ip}`, 7 * 24 * 3600, async () => {
    const res = await f(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code,region,city`, { headers: JSON_ACCEPT, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { success?: boolean; country?: string; country_code?: string; region?: string; city?: string };
    if (!j.success) return null;
    return { ip, country: j.country ?? null, countryCode: j.country_code ?? null, region: j.region ?? null, city: j.city ?? null };
  });
}

// ---------------------------------------------------------------------------
// Chrome UX Report History API: real-user p75 per weekly window. Uses the same Google key as PageSpeed.
// ---------------------------------------------------------------------------

interface CruxResponse {
  record?: {
    metrics?: Record<string, { percentilesTimeseries?: { p75s?: (number | string | null)[] } }>;
    collectionPeriods?: { lastDate?: { year: number; month: number; day: number } }[];
  };
}

const numOrNull = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Pure: turn the API's parallel arrays into one row per window. CLS p75s arrive as strings. */
export function parseCrux(origin: string, j: CruxResponse): CruxHistory | null {
  const rec = j.record;
  const periods = rec?.collectionPeriods ?? [];
  if (!rec || !periods.length) return null;
  const series = (name: string) => rec.metrics?.[name]?.percentilesTimeseries?.p75s ?? [];
  const lcp = series('largest_contentful_paint');
  const inp = series('interaction_to_next_paint');
  const cls = series('cumulative_layout_shift');
  const ttfb = series('experimental_time_to_first_byte');
  const rows: CruxPeriod[] = periods.map((p, i) => {
    const d = p.lastDate;
    return { end: d ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : '', lcpMs: numOrNull(lcp[i]), inpMs: numOrNull(inp[i]), cls: numOrNull(cls[i]), ttfbMs: numOrNull(ttfb[i]) };
  });
  const kept = rows.filter((r) => r.end && (r.lcpMs !== null || r.inpMs !== null || r.cls !== null));
  return kept.length ? { origin, formFactor: 'PHONE', periods: kept } : null;
}

export async function fetchCrux(url: string, cfg: ExternalConfig): Promise<CruxHistory | null> {
  if (cfg.crux === false || !cfg.googleApiKey) return null;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  const f = cfg.fetchImpl ?? fetch;
  return cached(cfg, `crux:${origin}`, 24 * 3600, async () => {
    const res = await f(`https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord?key=${encodeURIComponent(cfg.googleApiKey!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin, formFactor: 'PHONE', metrics: ['largest_contentful_paint', 'interaction_to_next_paint', 'cumulative_layout_shift', 'experimental_time_to_first_byte'] }),
      signal: AbortSignal.timeout(10_000)
    });
    // 404 = Google has no real-user data for this origin (too little traffic). That is an answer, not an error.
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return parseCrux(origin, (await res.json()) as CruxResponse);
  });
}

export type EnrichKeys = Pick<ExternalData, 'internetDb' | 'eolTables' | 'osv' | 'tranco' | 'geo' | 'crux'>;
