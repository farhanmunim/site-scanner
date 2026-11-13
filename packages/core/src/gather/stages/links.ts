import { safeFetch, FetchDenied, type SafeFetchOptions } from '../fetch.js';
import { LIMITS, RequestBudget, UNSAFE_LINK_PATH } from '../policy.js';
import { dohQuery } from '../doh.js';
import { detectChallenge } from './http.js';
import type { FetchedFile, LinkCheck, LinkSource, LinksStageData } from '../../types.js';

/**
 * Link stage: check that same-host links on the scanned page (and URLs in its sitemap)
 * still work, within a separate, small budget (LIMITS.maxLinkChecks).
 *
 * Safety rules, on top of everything safeFetch already enforces:
 *  - Only links on the scanned host are requested. External links get a DNS lookup only.
 *  - robots.txt is honoured (this is the most crawler-like thing the scanner does).
 *  - No query strings and nothing that looks state-changing (cart, logout, admin…).
 *  - HEAD first; GET (body capped at 1 KB) only when HEAD is refused.
 *  - Two requests in flight, a pause between requests, a hard wall-clock deadline.
 *  - 429 or a bot challenge stops the stage immediately. Redirects are not followed.
 */

const DECODE: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' };
const decodeEntities = (s: string) => s.replace(/&(amp|quot|#39|apos|lt|gt);/g, (m) => DECODE[m] ?? m);

/** Absolute http(s) URLs of every <a href> in the HTML, fragment removed, document order. */
export function extractLinks(html: string, baseUrl: string, max = 2000): string[] {
  let base = baseUrl;
  const b = /<base\b[^>]*\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html);
  if (b) {
    try {
      base = new URL(decodeEntities(b[1] ?? b[2] ?? b[3] ?? ''), baseUrl).toString();
    } catch {
      /* keep page URL */
    }
  }
  const out = new Set<string>();
  const re = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.size < max) {
    const raw = decodeEntities((m[1] ?? m[2] ?? m[3] ?? '').trim());
    if (!raw || raw.startsWith('#') || /^(mailto|tel|sms|javascript|data|ftp):/i.test(raw)) continue;
    try {
      const u = new URL(raw, base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      u.hash = '';
      out.add(u.toString());
    } catch {
      /* malformed href */
    }
  }
  return [...out];
}

/** <loc> entries of a sitemap or sitemap index. */
export function parseSitemap(xml: string): { index: boolean; locs: string[] } {
  const index = /<sitemapindex\b/i.test(xml);
  const locs: string[] = [];
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && locs.length < 50_000) locs.push(decodeEntities(m[1]!));
  return { index, locs };
}

export interface RobotsRules {
  allow: string[];
  disallow: string[];
}

/** Rules that apply to us: our own group if the site has one, otherwise the `*` group. */
export function robotsRulesFor(robotsTxt: string, agent = 'sitescannerbot'): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], allow: [], disallow: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' && val) cur.allow.push(val);
    else if (key === 'disallow' && val) cur.disallow.push(val);
  }
  const g = groups.find((x) => x.agents.some((a) => a !== '*' && agent.includes(a))) ?? groups.find((x) => x.agents.includes('*'));
  return { allow: g?.allow ?? [], disallow: g?.disallow ?? [] };
}

function ruleMatch(rule: string, path: string): number {
  // Google semantics: `*` matches any sequence, trailing `$` anchors. Returns match length or -1.
  const anchored = rule.endsWith('$');
  const body = anchored ? rule.slice(0, -1) : rule;
  const re = new RegExp('^' + body.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
  return re.test(path) ? body.length : -1;
}

/** Longest matching rule wins; on a tie, Allow wins. */
export function robotsAllows(rules: RobotsRules, pathAndQuery: string): boolean {
  let best = -1;
  let allowed = true;
  for (const r of rules.disallow) {
    const n = ruleMatch(r, pathAndQuery);
    if (n > best) {
      best = n;
      allowed = false;
    }
  }
  for (const r of rules.allow) {
    const n = ruleMatch(r, pathAndQuery);
    if (n >= best && n >= 0) {
      best = n;
      allowed = true;
    }
  }
  return allowed;
}

/** Up to n items spread evenly across the list (keeps first and last). */
export function sampleEvenly<T>(list: T[], n: number): T[] {
  if (list.length <= n) return [...list];
  if (n <= 0) return [];
  if (n === 1) return [list[0]!];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(list[Math.round((i * (list.length - 1)) / (n - 1))]!);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GatherLinksInput {
  finalUrl: string;
  html: string;
  renderedHtml?: string | null;
  robots: FetchedFile | null;
  sitemap: FetchedFile | null;
}

export interface GatherLinksOptions {
  fetch: SafeFetchOptions;
  /** DNS lookup for external hosts (injectable for tests). Returns true when the domain does not exist. */
  isDeadHost?: (host: string) => Promise<boolean>;
  limits?: Partial<Record<'maxLinkChecks' | 'linkCheckConcurrency' | 'linkCheckDelayMs' | 'linkCheckTimeoutMs' | 'linkStageDeadlineMs' | 'maxExternalDomains', number>>;
}

async function defaultIsDeadHost(host: string): Promise<boolean> {
  const r = await dohQuery(host, 'A');
  return r.status === 3; // NXDOMAIN
}

export async function gatherLinks(input: GatherLinksInput, opts: GatherLinksOptions): Promise<LinksStageData> {
  const L: Record<'maxLinkChecks' | 'linkCheckConcurrency' | 'linkCheckDelayMs' | 'linkCheckTimeoutMs' | 'linkStageDeadlineMs' | 'maxExternalDomains', number> = { ...LIMITS, ...opts.limits };
  const started = Date.now();
  const page = new URL(input.finalUrl);
  const host = page.hostname;
  const pageKey = (() => {
    const u = new URL(input.finalUrl);
    u.hash = '';
    return u.toString();
  })();

  // ---- Collect page links (raw + rendered HTML, so JS-built navigation counts too).
  const all = [...new Set([...extractLinks(input.html, input.finalUrl), ...(input.renderedHtml ? extractLinks(input.renderedHtml, input.finalUrl) : [])])];
  const internal: string[] = [];
  const externalByHost = new Map<string, string[]>();
  const insecure: string[] = [];
  for (const href of all) {
    const u = new URL(href);
    if (page.protocol === 'https:' && u.protocol === 'http:') insecure.push(href);
    if (u.hostname === host) internal.push(href);
    else {
      const list = externalByHost.get(u.hostname) ?? [];
      if (list.length < 5) list.push(href);
      externalByHost.set(u.hostname, list);
    }
  }

  const budget = new RequestBudget(0, L.maxLinkChecks);
  const discovered = new Set<string>();
  const fo: SafeFetchOptions = { ...opts.fetch, budget, target: { host, url: input.finalUrl }, context: { discoveredLinks: discovered }, timeoutMs: L.linkCheckTimeoutMs };

  // ---- Sitemap URLs. /sitemap.xml was already fetched by the files stage (no extra cost);
  // an index costs one request per child sitemap, from the link budget, at most two.
  const sitemapsRead: string[] = [];
  const sitemapLocs: string[] = [];
  if (input.sitemap?.status === 200 && input.sitemap.body) {
    sitemapsRead.push(`${page.origin}/sitemap.xml`);
    const sm = parseSitemap(input.sitemap.body);
    if (!sm.index) sitemapLocs.push(...sm.locs);
    else {
      for (const child of sm.locs.filter((l) => safeHost(l) === host && !new URL(l).search).slice(0, 2)) {
        discovered.add(child);
        try {
          const r = await safeFetch(child, { ...fo, accept: 'application/xml,text/xml,*/*;q=0.8', maxBytes: LIMITS.maxFileBytes });
          if (r.status === 200 && r.body) {
            sitemapsRead.push(child);
            sitemapLocs.push(...parseSitemap(r.body).locs);
          }
        } catch {
          /* budget / network: carry on with what we have */
        }
      }
    }
  }
  const sitemapInternal = [...new Set(sitemapLocs.filter((l) => safeHost(l) === host).map(stripHash))];

  // ---- Filter: robots.txt, query strings, state-changing paths, the page itself.
  const rules = input.robots?.status === 200 && input.robots.body ? robotsRulesFor(input.robots.body) : { allow: [], disallow: [] };
  const skipped = { robots: 0, query: 0, unsafe: 0 };
  const sources = new Map<string, LinkSource[]>();
  const eligible = (list: string[], src: LinkSource): string[] => {
    const out: string[] = [];
    for (const href of list) {
      if (href === pageKey) continue;
      const known = sources.get(href);
      if (known) {
        if (!known.includes(src)) known.push(src);
        continue;
      }
      const u = new URL(href);
      if (u.search) {
        skipped.query++;
        continue;
      }
      if (UNSAFE_LINK_PATH.test(u.pathname)) {
        skipped.unsafe++;
        continue;
      }
      if (!robotsAllows(rules, u.pathname)) {
        skipped.robots++;
        continue;
      }
      sources.set(href, [src]);
      out.push(href);
    }
    return out;
  };
  const fromPage = eligible(internal, 'page');
  const fromSitemap = eligible(sitemapInternal, 'sitemap');
  const candidates = fromPage.length + fromSitemap.length;

  // ---- Choose what to check. Small sites: everything. Large: an even spread, page links first.
  const slots = budget.remaining;
  let pick: string[];
  if (candidates <= slots) pick = [...fromPage, ...fromSitemap];
  else {
    const pageQuota = Math.min(fromPage.length, Math.max(slots - fromSitemap.length, Math.ceil(slots * 0.6)));
    const sitemapQuota = Math.min(fromSitemap.length, slots - pageQuota);
    pick = [...sampleEvenly(fromPage, slots - sitemapQuota), ...sampleEvenly(fromSitemap, sitemapQuota)];
  }
  for (const p of pick) discovered.add(p);

  // ---- Check them.
  const checked: LinkCheck[] = [];
  let stoppedReason: string | null = null;
  let restricted: LinksStageData['restricted'] = null;
  const queue = [...pick];
  const worker = async () => {
    while (queue.length && !stoppedReason) {
      if (Date.now() - started > L.linkStageDeadlineMs) {
        stoppedReason = 'Time limit for link checks reached';
        break;
      }
      const url = queue.shift()!;
      const res = await checkOne(url, fo);
      if (res === 'budget') {
        stoppedReason = 'Link check budget used up';
        break;
      }
      checked.push({ ...res, sources: sources.get(url) ?? ['page'] });
      if (res.status === 429 || res.challenge) {
        restricted = { status: res.status ?? 0, vendor: res.challenge };
        stoppedReason = res.challenge ? `${res.challenge} challenge — stopped checking links` : 'The site asked us to slow down (HTTP 429) — stopped checking links';
        break;
      }
      // A 403 may just be a members-only page, but it may also be a WAF that does not label
      // itself. Either way we stop rather than keep knocking (no domain cool-down for this one).
      if (res.status === 403) {
        stoppedReason = 'A link returned HTTP 403 — stopped checking links to stay polite';
        break;
      }
      if (queue.length) await sleep(L.linkCheckDelayMs);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, L.linkCheckConcurrency) }, worker));
  checked.sort((a, b) => pick.indexOf(a.url) - pick.indexOf(b.url));

  // ---- External hosts: DNS only, never a request to the site.
  const isDead = opts.isDeadHost ?? defaultIsDeadHost;
  const hosts = [...externalByHost.keys()].slice(0, L.maxExternalDomains);
  const deadHosts: LinksStageData['external']['deadHosts'] = [];
  const hq = [...hosts];
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (hq.length) {
        const h = hq.shift()!;
        try {
          if (await isDead(h)) deadHosts.push({ host: h, links: externalByHost.get(h) ?? [] });
        } catch {
          /* resolver trouble is not evidence of a dead domain */
        }
      }
    })
  );

  return {
    pageLinks: internal.length,
    sitemapUrls: sitemapInternal.length,
    sitemapsRead,
    candidates,
    skipped,
    checked,
    complete: !stoppedReason && checked.length === candidates,
    stoppedReason,
    restricted,
    external: { hosts: externalByHost.size, checked: hosts.length, deadHosts },
    insecureLinks: { total: insecure.length, sample: insecure.slice(0, 20) }
  };
}

function safeHost(u: string): string | null {
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
}

function stripHash(u: string): string {
  const x = new URL(u);
  x.hash = '';
  return x.toString();
}

type CheckResult = Omit<LinkCheck, 'sources'> & { challenge: string | null };

async function checkOne(url: string, fo: SafeFetchOptions): Promise<CheckResult | 'budget'> {
  const attempt = async (method: 'HEAD' | 'GET') => safeFetch(url, { ...fo, method, maxBytes: 1024, accept: 'text/html,*/*;q=0.8' });
  try {
    let method: 'HEAD' | 'GET' = 'HEAD';
    let r = await attempt('HEAD');
    // Some servers refuse HEAD outright; one capped GET settles it (costs another budget slot).
    if (r.status === 405 || r.status === 501) {
      try {
        r = await attempt('GET');
        method = 'GET';
      } catch (e) {
        if (!(e instanceof FetchDenied && e.code === 'budget')) throw e;
      }
    }
    // 429 is handled on its own (detectChallenge would label it "Rate limit").
    const challenge = r.status === 429 ? null : (detectChallenge(r.status, r.headers, r.body)?.vendor ?? null);
    const location = r.status >= 300 && r.status < 400 ? r.headers['location'] : undefined;
    return { url, status: r.status, method, location: location ? resolve(location, url) : undefined, challenge };
  } catch (e) {
    if (e instanceof FetchDenied && e.code === 'budget') return 'budget';
    const cause = (e as { cause?: { code?: string } }).cause;
    const msg = e instanceof FetchDenied ? e.message : (e as Error).name === 'TimeoutError' ? 'Timed out' : (cause?.code ?? (e as Error).message);
    return { url, status: null, method: 'HEAD', error: msg, challenge: null };
  }
}

function resolve(loc: string, base: string): string {
  try {
    return new URL(loc, base).toString();
  } catch {
    return loc;
  }
}
