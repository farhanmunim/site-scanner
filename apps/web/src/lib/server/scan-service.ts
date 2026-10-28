import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { and, blocklist, desc, domains, eq, gt, inArray, lookups, scans, settings, SETTINGS_KEYS, count } from '@site-scanner/db';
import { isScope, LIMITS, prepareTarget, ScanRefused } from '@site-scanner/core';
import { getDb } from './db.js';
import { getQueue, rateLimitHit } from './redis.js';
import { config } from './config.js';

/**
 * The single entry point for "scan this site". Enforces, in order: kill switch, URL
 * validation + denylist + blocklist, per-IP and per-domain rate limits, Turnstile, domain
 * cool-down, cache/dedupe, global queue cap. Every request is logged to `lookups`.
 */

export interface ScanRequest {
  input: string;
  ip: string;
  country: string | null;
  userAgent: string | null;
  referrer: string | null;
  turnstileToken?: string | null;
  source: 'web' | 'api' | 'admin';
  /** Focused tool to run (see core scope.ts); anything else is a full scan. */
  scope?: string | null;
  /** Bypass cache (admin re-scan). */
  force?: boolean;
}

export type ScanResult = { ok: true; scanId: string; cached: boolean; notice?: string } | { ok: false; status: number; error: string };

/** The only notices a result page will display; ?notice= is matched against these, never rendered verbatim. */
export const NOTICES = {
  inProgress: 'A scan of this site is already in progress; showing it.',
  restricted: 'This site restricts automated access; showing the most recent result.',
  recent: 'This site was scanned several times recently; showing the latest result.'
} as const;
export function knownNotice(v: string | null): string | null {
  return v && (Object.values(NOTICES) as string[]).includes(v) ? v : null;
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`${config.ipHashSalt}:${ip}`).digest('hex').slice(0, 32);
}

async function setting<T>(key: string, fallback: T): Promise<T> {
  const row = await getDb().select().from(settings).where(eq(settings.key, key)).limit(1);
  return (row[0]?.value as T | undefined) ?? fallback;
}

async function verifyTurnstile(token: string | null | undefined, ip: string): Promise<boolean> {
  if (!config.turnstileSecret) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: config.turnstileSecret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(6000)
    });
    const j = (await res.json()) as { success?: boolean };
    return !!j.success;
  } catch {
    return false;
  }
}

export async function requestScan(req: ScanRequest): Promise<ScanResult> {
  const db = getDb();
  const ipHash = hashIp(req.ip);
  const logLookup = async (fields: Partial<typeof lookups.$inferInsert>) => {
    await db.insert(lookups).values({ input: req.input.slice(0, 2048), ip: req.ip, ipHash, country: req.country, userAgent: req.userAgent?.slice(0, 500) ?? null, referrer: req.referrer?.slice(0, 500) ?? null, source: req.source, ...fields }).catch(() => {});
  };
  const refuse = async (status: number, error: string, host?: string, registrableDomain?: string): Promise<ScanResult> => {
    await logLookup({ refusedReason: error, host, registrableDomain });
    return { ok: false, status, error };
  };

  if (req.source !== 'admin' && (await setting(SETTINGS_KEYS.scanningPaused, false))) return refuse(503, 'Scanning is paused for maintenance. Please try again later.');

  // Cheap front-door limiter, before anything is written: without it every request (even a refused one)
  // adds a lookups row, so a flood from one address could fill the table.
  if (req.source !== 'admin') {
    const burst = await rateLimitHit(`rl:req:${ipHash}`, 60).catch(() => null);
    if (burst !== null && burst > 60) return { ok: false, status: 429, error: 'Too many requests. Please slow down.' };
  }

  const scope = isScope(req.scope) ? req.scope : 'full';
  // A full scan can answer any focused request; a focused scan only answers the same tool.
  const acceptable = scope === 'full' ? ['full'] : ['full', scope];
  let target;
  try {
    const blocked = (await db.select({ domain: blocklist.domain }).from(blocklist)).map((b) => b.domain);
    target = prepareTarget(req.input, { ownHosts: config.ownHosts, denySuffixes: config.denySuffixes, blockedDomains: blocked });
  } catch (e) {
    if (e instanceof ScanRefused) return refuse(400, e.message);
    throw e;
  }

  if (req.source !== 'admin') {
    const perIp = await setting(SETTINGS_KEYS.maxScansPerIpPerHour, LIMITS.maxScansPerIpPerHour);
    // Fail closed: if the limiter store is down we refuse rather than run unmetered.
    const ipHits = await rateLimitHit(`rl:ip:${ipHash}`, 3600).catch(() => null);
    if (ipHits === null) return refuse(503, 'The scanner is temporarily unavailable. Please try again shortly.', target.host, target.registrableDomain);
    if (ipHits > perIp) return refuse(429, 'Too many scans from your network in the last hour. Please try again later.', target.host, target.registrableDomain);
    if (!(await verifyTurnstile(req.turnstileToken, req.ip))) return refuse(400, 'Please complete the human check and try again.', target.host, target.registrableDomain);
  }

  // Cache: a recent finished scan of the exact URL.
  const cacheMinutes = await setting(SETTINGS_KEYS.cacheWindowMinutes, LIMITS.cacheWindowMs / 60000);
  if (!req.force) {
    const [recent] = await db
      .select({ id: scans.id, status: scans.status })
      .from(scans)
      .where(and(eq(scans.url, target.url), gt(scans.createdAt, new Date(Date.now() - cacheMinutes * 60_000)), inArray(scans.status, ['complete', 'partial', 'restricted']), inArray(scans.scope, acceptable)))
      .orderBy(desc(scans.createdAt))
      .limit(1);
    if (recent) {
      await logLookup({ host: target.host, registrableDomain: target.registrableDomain, scanId: recent.id, cacheHit: true });
      return { ok: true, scanId: recent.id, cached: true };
    }
    // Dedupe: a scan of this exact URL is already queued/running.
    const [active] = await db
      .select({ id: scans.id })
      .from(scans)
      .where(and(eq(scans.url, target.url), inArray(scans.status, ['queued', 'running']), inArray(scans.scope, acceptable)))
      .orderBy(desc(scans.createdAt))
      .limit(1);
    if (active) {
      await logLookup({ host: target.host, registrableDomain: target.registrableDomain, scanId: active.id, cacheHit: true });
      return { ok: true, scanId: active.id, cached: true, notice: NOTICES.inProgress };
    }
  }

  // Domain cool-down after the site restricted us: serve the last result, never re-knock.
  const [dom] = await db.select().from(domains).where(eq(domains.registrableDomain, target.registrableDomain)).limit(1);
  if (req.source !== 'admin' && dom?.cooldownUntil && dom.cooldownUntil > new Date()) {
    if (dom.latestScanId) {
      await logLookup({ host: target.host, registrableDomain: target.registrableDomain, scanId: dom.latestScanId, cacheHit: true });
      return { ok: true, scanId: dom.latestScanId, cached: true, notice: NOTICES.restricted };
    }
    return refuse(429, 'This site restricts automated access. Please try again later.', target.host, target.registrableDomain);
  }

  if (req.source !== 'admin') {
    const perDomain = await setting(SETTINGS_KEYS.maxScansPerDomainPerHour, LIMITS.maxScansPerDomainPerHour);
    const domainHits = await rateLimitHit(`rl:domain:${target.registrableDomain}`, 3600).catch(() => null);
    if (domainHits === null) return refuse(503, 'The scanner is temporarily unavailable. Please try again shortly.', target.host, target.registrableDomain);
    if (domainHits > perDomain) {
      if (dom?.latestScanId) {
        await logLookup({ host: target.host, registrableDomain: target.registrableDomain, scanId: dom.latestScanId, cacheHit: true });
        return { ok: true, scanId: dom.latestScanId, cached: true, notice: NOTICES.recent };
      }
      return refuse(429, 'This site has been scanned many times in the last hour. Please try again later.', target.host, target.registrableDomain);
    }
  }

  const [depthRow] = await db.select({ depth: count() }).from(scans).where(inArray(scans.status, ['queued', 'running']));
  if ((depthRow?.depth ?? 0) >= config.maxQueueDepth) return refuse(503, 'The scanner is busy right now. Please try again in a minute.', target.host, target.registrableDomain);

  // The partial unique index (one active scan per url+scope) makes concurrent identical requests collapse onto one scan.
  const [row] = await db
    .insert(scans)
    .values({ scope, host: target.host, displayHost: target.displayHost, registrableDomain: target.registrableDomain, inputUrl: req.input.slice(0, 2048), url: target.url, requesterIpHash: ipHash, requesterCountry: req.country })
    .onConflictDoNothing()
    .returning({ id: scans.id });
  if (!row) {
    const [active] = await db.select({ id: scans.id }).from(scans).where(and(eq(scans.url, target.url), inArray(scans.status, ['queued', 'running']), inArray(scans.scope, acceptable))).orderBy(desc(scans.createdAt)).limit(1);
    if (active) {
      await logLookup({ host: target.host, registrableDomain: target.registrableDomain, scanId: active.id, cacheHit: true });
      return { ok: true, scanId: active.id, cached: true, notice: NOTICES.inProgress };
    }
    return refuse(503, 'The scanner is busy right now. Please try again in a minute.', target.host, target.registrableDomain);
  }
  const scanId = row.id;
  await logLookup({ host: target.host, registrableDomain: target.registrableDomain, scanId, cacheHit: false });
  try {
    await getQueue().add('scan', { scanId }, { jobId: scanId });
  } catch (e) {
    await db.update(scans).set({ status: 'failed', error: 'Could not queue the scan (queue unavailable).' }).where(eq(scans.id, scanId));
    return { ok: false, status: 503, error: 'The scanner is temporarily unavailable. Please try again shortly.' };
  }
  return { ok: true, scanId, cached: false };
}

export function clientIp(request: Request, getClientAddress: () => string): { ip: string; country: string | null } {
  const cf = request.headers.get('cf-connecting-ip');
  // CF-Connecting-IP is only believable if the request really came through Cloudflare. When the origin is
  // reachable directly anyone can forge it, so an optional shared secret (set as a header by a Cloudflare
  // Transform Rule) gates it, and the value must be a real IP address.
  const secretOk = !config.originSecret || request.headers.get('x-origin-secret') === config.originSecret;
  const ip = config.behindCloudflare && cf && secretOk && isIP(cf.trim()) ? cf.trim() : getClientAddress();
  const country = request.headers.get('cf-ipcountry');
  return { ip, country: country && country !== 'XX' && country !== 'T1' ? country.slice(0, 2) : null };
}
