/** Subdomains from Certificate Transparency logs and passive DNS. */
import { promises as dnsPromises } from 'node:dns';
import { cached } from './cache.js';
import { getWithRetry } from './http.js';
import { takeQuota } from './quota.js';
import type { ExternalConfig } from './config.js';
import type { SubdomainData } from '../types.js';

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
      // Each public source has its own limit (HackerTarget allows about 50 a day); an exhausted one is skipped.
      if (!(await takeQuota(cfg.quota, { 'ct-log': 'crtsh', certspotter: 'certspotter', hackertarget: 'hackertarget' }[src.id]))) continue;
      const raw = await src.fetch(registrableDomain, f).catch(() => null);
      if (!raw) continue;
      const { names, total } = collectSubdomains(raw, registrableDomain);
      return { checkedAt: new Date().toISOString(), source: src.id, names, total, ...(await checkLive(registrableDomain, names, cfg)) };
    }
    return null;
  });
}
