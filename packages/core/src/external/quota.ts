/**
 * Spending limits for every outside service. Free tiers are small and some providers suspend keys that keep asking, so
 * the scanner keeps its own budget per source, shared by every worker through Redis. A source over budget is skipped
 * (the report simply omits it, like a missing key); it is never queued or retried, and cache hits cost nothing.
 *
 * Limits sit comfortably below each provider's published free allowance.
 */
export interface QuotaRule {
  id: string;
  label: string;
  /** Requests allowed per rolling clock minute (UTC), across all workers. */
  perMinute?: number;
  /** Requests allowed per UTC day, across all workers. */
  perDay: number;
  /** What the provider documents, for the admin page. */
  provider: string;
}

export const QUOTAS: QuotaRule[] = [
  { id: 'virustotal', label: 'VirusTotal', perMinute: 3, perDay: 400, provider: 'free: 4 a minute, 500 a day' },
  { id: 'abuseipdb', label: 'AbuseIPDB', perMinute: 20, perDay: 800, provider: 'free: 1,000 checks a day' },
  { id: 'otx', label: 'AlienVault OTX', perMinute: 30, perDay: 2000, provider: 'free: fair use' },
  { id: 'urlhaus', label: 'URLhaus', perMinute: 30, perDay: 2000, provider: 'free: fair use' },
  { id: 'psi', label: 'PageSpeed Insights', perMinute: 10, perDay: 1500, provider: 'free key: 25,000 a day, 240 a minute' },
  { id: 'crux', label: 'Chrome UX Report', perMinute: 60, perDay: 3000, provider: 'free: 150 a second' },
  { id: 'safebrowsing', label: 'Safe Browsing', perMinute: 60, perDay: 4000, provider: 'free: 10,000 a day' },
  { id: 'wordfence', label: 'Wordfence feed', perDay: 12, provider: 'free key: rate-limited feed download' },
  { id: 'wporg', label: 'WordPress.org API', perMinute: 60, perDay: 5000, provider: 'free: fair use' },
  { id: 'internetdb', label: 'Shodan InternetDB', perMinute: 60, perDay: 5000, provider: 'free: fair use' },
  { id: 'geo', label: 'ipwho.is', perMinute: 20, perDay: 300, provider: 'free: about 10,000 a month' },
  { id: 'tranco', label: 'Tranco', perMinute: 30, perDay: 2000, provider: 'free: fair use' },
  { id: 'eol', label: 'endoflife.date', perMinute: 30, perDay: 600, provider: 'free: fair use' },
  { id: 'osv', label: 'OSV.dev', perMinute: 60, perDay: 3000, provider: 'free: fair use' },
  { id: 'wayback', label: 'Wayback Machine', perMinute: 30, perDay: 1000, provider: 'free: fair use' },
  { id: 'greenweb', label: 'Green Web Foundation', perMinute: 30, perDay: 1000, provider: 'free: fair use' },
  { id: 'retire', label: 'retire.js repository', perDay: 50, provider: 'GitHub raw: cached 24 h' },
  { id: 'crtsh', label: 'crt.sh', perMinute: 5, perDay: 300, provider: 'free: fair use, often overloaded' },
  { id: 'certspotter', label: 'Certspotter', perMinute: 2, perDay: 400, provider: 'free: 100 an hour' },
  { id: 'hackertarget', label: 'HackerTarget', perDay: 40, provider: 'free: 50 a day' }
];

const BY_ID = new Map(QUOTAS.map((q) => [q.id, q]));

/** Cache-key prefix -> quota id. */
const PREFIXES: [string, string][] = [
  ['psi2:', 'psi'],
  ['gsb:', 'safebrowsing'],
  ['wporg:', 'wporg'],
  ['wptheme:', 'wporg'],
  ['wp-latest', 'wporg'],
  ['retire:', 'retire'],
  ['wayback:', 'wayback'],
  ['green:', 'greenweb'],
  ['subdomains3:', 'subdomains'],
  ['tranco:', 'tranco'],
  ['geo:', 'geo'],
  ['crux:', 'crux'],
  ['idb:', 'internetdb'],
  ['eol2:', 'eol'],
  ['osv:', 'osv'],
  ['rep:vt:', 'virustotal'],
  ['rep:abuse:', 'abuseipdb'],
  ['rep:otx:', 'otx'],
  ['rep:urlhaus:', 'urlhaus']
];

export const quotaIdForKey = (key: string): string | null => PREFIXES.find(([p]) => key.startsWith(p))?.[1] ?? null;

/** Increment-and-read counter shared by all workers (Redis in production). Returns the new count. */
export interface QuotaStore {
  hit(key: string, ttlSec: number): Promise<number>;
}

export const quotaKeys = (id: string, now = new Date()) => ({
  minute: `quota:${id}:m:${Math.floor(now.getTime() / 60_000)}`,
  day: `quota:${id}:d:${now.toISOString().slice(0, 10)}`,
  skipped: `quota:${id}:skipped:${now.toISOString().slice(0, 10)}`
});

/**
 * Take one request from a source's budget. true = go ahead. Without a store (tests, local use) everything is allowed;
 * if the store is configured but unreachable, the answer is no: failing open would let an outage burn the free tier.
 */
export async function takeQuota(store: QuotaStore | undefined, id: string, now = new Date()): Promise<boolean> {
  const rule = BY_ID.get(id);
  if (!store || !rule || id === 'subdomains') return true;
  const k = quotaKeys(id, now);
  try {
    if (rule.perMinute && (await store.hit(k.minute, 120)) > rule.perMinute) {
      await store.hit(k.skipped, 2 * 86400);
      return false;
    }
    if ((await store.hit(k.day, 2 * 86400)) > rule.perDay) {
      await store.hit(k.skipped, 2 * 86400);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
