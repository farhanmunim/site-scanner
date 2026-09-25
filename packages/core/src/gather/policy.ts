import { parse as parseDomain } from 'tldts';
import { sameSite } from './url.js';

/**
 * Target-safety policy — the mandatory "never harm the target, our IP or our host"
 * rules, expressed as code so they can be unit-tested rather than remembered.
 *
 *  - GET/HEAD only, fixed allowlist of paths, hard per-scan request budget.
 *  - No retries on 403/429/challenge, no bot-protection bypass, honest User-Agent.
 *  - Denylist for government / military / health / critical infra suffixes + manual blocks.
 */

export const LIMITS = {
  /** Requests to the target host per scan (all stages combined). */
  maxRequestsPerScan: 25,
  maxRedirects: 5,
  /** Bytes of HTML kept from the main document. */
  maxHtmlBytes: 512 * 1024,
  /** Bytes read from any single auxiliary file (robots, scripts, readme.txt...). */
  maxFileBytes: 256 * 1024,
  /** Scripts fetched for content fingerprinting. */
  maxScriptsFetched: 6,
  /** WordPress plugin readme.txt files fetched for version discovery. */
  maxPluginReadmes: 8,
  /** Wall-clock budget for a single stage request. */
  requestTimeoutMs: 12_000,
  /** Recent-scan cache window. */
  cacheWindowMs: 15 * 60 * 1000,
  /** Fresh scans allowed per registrable domain per hour (all users). */
  maxScansPerDomainPerHour: 6,
  /** Scans allowed per client IP per hour. */
  maxScansPerIpPerHour: 20,
  /** Cool-down applied to a domain after a 403/429/challenge. */
  restrictedCooldownMs: 60 * 60 * 1000
} as const;

export const USER_AGENT = (siteUrl: string) =>
  `Mozilla/5.0 (compatible; SiteScannerBot/1.0; +${siteUrl.replace(/\/$/, '')}/bot)`;

/** Paths we may request relative to the site root, independent of what we found. */
export const WELL_KNOWN_PATHS = [
  '/robots.txt',
  '/sitemap.xml',
  '/.well-known/security.txt',
  '/ads.txt',
  '/llms.txt',
  '/favicon.ico'
] as const;

/** Extra public endpoints allowed once WordPress has been detected. */
export const WORDPRESS_PATHS = ['/wp-json/'] as const;

export type AllowedMethod = 'GET' | 'HEAD';

export interface PathPermission {
  allowed: boolean;
  reason?: string;
}

/**
 * Is this URL something the policy lets us request during a scan of `target`?
 * `context` lists what has already been observed (script URLs, CMS) so that
 * CMS-specific public files are only fetched when the page itself referenced them.
 */
export function isPathAllowed(
  candidate: string,
  target: { host: string; url: string },
  context: { discoveredScripts?: Set<string>; wordpress?: boolean; discoveredCmsFiles?: Set<string> } = {}
): PathPermission {
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { allowed: false, reason: 'invalid url' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { allowed: false, reason: 'scheme' };

  const onTargetSite = sameSite(u.hostname, target.host);
  if (!onTargetSite) {
    // Off-site fetches are limited to script files the page itself referenced.
    if (context.discoveredScripts?.has(candidate)) return { allowed: true };
    return { allowed: false, reason: 'off-site' };
  }

  const path = u.pathname;
  if (candidate === target.url || candidate.split('#')[0] === target.url) return { allowed: true };
  if ((WELL_KNOWN_PATHS as readonly string[]).includes(path) && u.search === '') return { allowed: true };
  if (context.discoveredScripts?.has(candidate)) return { allowed: true };
  if (context.discoveredCmsFiles?.has(candidate)) return { allowed: true };
  if (context.wordpress) {
    if ((WORDPRESS_PATHS as readonly string[]).includes(path) && u.search === '') return { allowed: true };
    // theme stylesheet header / plugin readme for slugs the page referenced
    if (/^\/wp-content\/themes\/[a-z0-9_-]+\/style\.css$/i.test(path)) return { allowed: true };
    if (/^\/wp-content\/plugins\/[a-z0-9_-]+\/readme\.txt$/i.test(path)) return { allowed: true };
  }
  return { allowed: false, reason: 'path not on allowlist' };
}

/** Suffixes we refuse to scan by default (configurable via env DENYLIST_EXTRA / allow overrides). */
export const DEFAULT_DENY_SUFFIXES = [
  // government / military / emergency / health / critical infra
  '.gov',
  '.mil',
  '.gov.uk',
  '.police.uk',
  '.nhs.uk',
  '.mod.uk',
  '.parliament.uk',
  '.gc.ca',
  '.gov.au',
  '.govt.nz',
  '.gouv.fr',
  '.bund.de',
  '.gov.in',
  '.go.jp',
  '.gov.sg',
  '.europa.eu',
  '.int',
  // financial / payment infrastructure where scanning invites abuse reports
  '.bank',
  '.swift.com',
  // scanning ourselves
  'localhost',
  '.local',
  '.internal',
  '.arpa'
] as const;

export interface DenyCheck {
  denied: boolean;
  reason?: string;
}

export function checkDenylist(
  host: string,
  opts: { extraSuffixes?: string[]; blockedDomains?: Iterable<string>; ownHosts?: Iterable<string> } = {}
): DenyCheck {
  const h = host.toLowerCase();
  const suffixes = [...DEFAULT_DENY_SUFFIXES, ...(opts.extraSuffixes ?? [])];
  for (const s of suffixes) {
    if (h === s.replace(/^\./, '') || h.endsWith(s.startsWith('.') ? s : '.' + s)) {
      return { denied: true, reason: `Websites under ${s} are not scanned by this tool.` };
    }
  }
  const registrable = parseDomain(h).domain ?? h;
  for (const d of opts.blockedDomains ?? []) {
    const b = d.toLowerCase();
    if (h === b || registrable === b || h.endsWith('.' + b)) {
      return { denied: true, reason: 'The owner of this website has opted out of scanning, or it has been blocked.' };
    }
  }
  for (const own of opts.ownHosts ?? []) {
    if (own && (h === own.toLowerCase() || h.endsWith('.' + own.toLowerCase()))) {
      return { denied: true, reason: 'The scanner does not scan itself.' };
    }
  }
  return { denied: false };
}

/** HTTP statuses after which we stop touching the target for this scan (and cool down). */
export function isRestrictedStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429;
}

/**
 * Request budget for one scan. Every fetch to the target must `take()` first.
 * Shared across stages by persisting `used` in the scan row between invocations.
 */
export class RequestBudget {
  constructor(
    public used = 0,
    public readonly limit: number = LIMITS.maxRequestsPerScan
  ) {}
  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }
  take(n = 1): boolean {
    if (this.used + n > this.limit) return false;
    this.used += n;
    return true;
  }
}
