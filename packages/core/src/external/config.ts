/** Spending limits, keys and switches shared by every outside source. */
import { takeQuota, type QuotaStore } from './quota.js';

/**
 * Optional free enrichment APIs. Every function returns null (never throws) when the key
 * is missing or the API fails; the report then simply omits that section. Callers should
 * cache results (see apps/worker) so a popular domain doesn't burn quota.
 */

export interface ExternalConfig {
  googleApiKey?: string;
  /** Free key from wordfence.com (Integrations); the v3 vulnerability feed rejects anonymous requests. */
  wordfenceApiKey?: string;
  psi?: boolean;
  safeBrowsing?: boolean;
  wordpress?: boolean;
  wayback?: boolean;
  greenWeb?: boolean;
  subdomains?: boolean;
  retire?: boolean;
  blocklists?: boolean;
  propagation?: boolean;
  /** Keyless datasets (all default on): Shodan InternetDB, endoflife.date, OSV.dev, Tranco, ipwho.is. */
  internetDb?: boolean;
  eol?: boolean;
  osv?: boolean;
  tranco?: boolean;
  geo?: boolean;
  /** Chrome UX Report history (needs googleApiKey with the CrUX API enabled). */
  crux?: boolean;
  /** Free keys for the threat-intelligence sources; each source is skipped without its key. */
  virustotalKey?: string;
  abuseipdbKey?: string;
  otxKey?: string;
  urlhausKey?: string;
  reputation?: boolean;
  /** Test hook: true = resolves, false = definitely does not, null = could not tell. */
  resolveName?: (name: string) => Promise<boolean | null>;
  fetchImpl?: typeof fetch;
  /** Shared spending counters (Redis in production); see quota.ts. Unset = no limits (tests). */
  quota?: QuotaStore;
  /** Cache: get/set JSON by key with TTL seconds. */
  cache?: { get<T>(key: string): Promise<T | null | undefined>; set(key: string, value: unknown, ttlSec: number): Promise<void> };
}
