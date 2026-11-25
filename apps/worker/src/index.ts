import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { hostname } from 'node:os';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { and, blocklist, createDb, domains, eq, gt, isNotNull, lookups, lt, runMigrations, scans, scanTechnologies, settings, SETTINGS_KEYS, sql, workers, apiCache, type Db } from '@site-scanner/db';
import { analyse, gather, loadFingerprints, prepareTarget, ScanRefused, LIMITS, isRestrictedStatus, SCANNER_VERSION, type GatheredData, type StageName } from '@site-scanner/core';
import { config, SCAN_QUEUE } from './config.js';
import { log } from './log.js';
import { closeBrowser, renderPage } from './browser.js';

/**
 * Scan worker. Consumes `scan` jobs, runs gather → analyse, writes progress to Postgres
 * after every stage so the web app can show partial results, and records aggregates for
 * the owner's admin console. Also runs housekeeping (IP redaction, screenshot expiry).
 */

const { db, client } = createDb(config.databaseUrl, { max: 4 });
await runMigrations(db);
const { version: fingerprintsVersion, db: fpDb } = loadFingerprints();
log.info({ technologies: Object.keys(fpDb).length, fingerprintsVersion, browser: config.browserEnabled }, 'worker starting');

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return (row[0]?.value as T | undefined) ?? fallback;
}

/** Cache adapter for external APIs, backed by Postgres. */
const cache = {
  async get<T>(key: string): Promise<T | null | undefined> {
    const row = await db.select().from(apiCache).where(and(eq(apiCache.key, key), gt(apiCache.expiresAt, new Date()))).limit(1);
    return row[0] ? (row[0].value as T) : undefined;
  },
  async set(key: string, value: unknown, ttlSec: number) {
    await db
      .insert(apiCache)
      .values({ key, value: value as object, expiresAt: new Date(Date.now() + ttlSec * 1000) })
      .onConflictDoUpdate({ target: apiCache.key, set: { value: value as object, expiresAt: new Date(Date.now() + ttlSec * 1000) } });
  }
};

async function processScan(job: Job<{ scanId: string }>): Promise<void> {
  const { scanId } = job.data;
  const [row] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
  if (!row) throw new Error(`scan ${scanId} not found`);
  if (row.status !== 'queued') {
    log.warn({ scanId, status: row.status }, 'scan not in queued state; skipping');
    return;
  }
  if (await getSetting(SETTINGS_KEYS.scanningPaused, false)) {
    await db.update(scans).set({ status: 'failed', error: 'Scanning is paused by the administrator.', finishedAt: new Date() }).where(eq(scans.id, scanId));
    return;
  }

  const started = Date.now();
  await db.update(scans).set({ status: 'running', startedAt: new Date(), scannerVersion: SCANNER_VERSION, fingerprintsVersion }).where(eq(scans.id, scanId));
  await db.update(workers).set({ currentScanId: scanId, lastSeenAt: new Date() }).where(eq(workers.id, config.workerId));
  log.info({ scanId, host: row.host }, 'scan started');

  // Re-validate against the live blocklist (it may have changed since the request was accepted).
  const blocked = (await db.select({ domain: blocklist.domain }).from(blocklist)).map((b) => b.domain);
  let target;
  try {
    target = prepareTarget(row.url, { ownHosts: config.ownHosts, denySuffixes: config.denySuffixes, blockedDomains: blocked });
  } catch (e) {
    const msg = e instanceof ScanRefused ? e.message : String(e);
    await db.update(scans).set({ status: 'failed', error: msg, finishedAt: new Date(), durationMs: Date.now() - started }).where(eq(scans.id, scanId));
    return;
  }

  const browserEnabled = config.browserEnabled && (await getSetting(SETTINGS_KEYS.browserEnabled, true));
  const externalEnabled = await getSetting(SETTINGS_KEYS.externalEnabled, true);

  const persist = async (stage: StageName, data: GatheredData) => {
    // Progressive report: analyse is deterministic and cheap, so re-run it after each stage.
    let report;
    try {
      report = analyse(data, { screenshotUrl: (p) => `/screenshots/${p}` });
    } catch (e) {
      log.error({ scanId, stage, err: (e as Error).message }, 'analyse failed');
      return;
    }
    await db.update(scans).set({ stages: data.stages, gathered: stripForStorage(data), report, finalUrl: data.http?.final?.url ?? null, screenshotPath: data.browser?.screenshot?.path ?? null }).where(eq(scans.id, scanId));
    log.info({ scanId, stage, status: data.stages[stage].status, ms: data.stages[stage].durationMs }, 'stage done');
  };

  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Scan exceeded ${config.scanTimeoutMs / 1000}s`)), config.scanTimeoutMs));
  let data: GatheredData;
  try {
    data = await Promise.race([
      gather(target, {
        scanId,
        selfUrl: config.publicSiteUrl,
        ownHosts: config.ownHosts,
        ownIps: config.ownIps,
        denySuffixes: config.denySuffixes,
        blockedDomains: blocked,
        fingerprintsVersion,
        external: externalEnabled ? { googleApiKey: config.googleApiKey, psi: config.psiEnabled, safeBrowsing: config.safeBrowsingEnabled, wordpress: config.wordpressApisEnabled, cache } : { psi: false, safeBrowsing: false, wordpress: false, wayback: false, greenWeb: false },
        onStage: (stage, d) => persist(stage, d),
        browser: browserEnabled ? renderPage : undefined
      }),
      timeout
    ]);
  } catch (e) {
    const msg = (e as Error).message;
    log.error({ scanId, err: msg }, 'scan failed');
    await db.update(scans).set({ status: 'failed', error: msg, finishedAt: new Date(), durationMs: Date.now() - started }).where(eq(scans.id, scanId));
    return;
  }

  const report = analyse(data, { screenshotUrl: (p) => `/screenshots/${p}` });
  const status = report.scan.quality === 'complete' ? 'complete' : report.scan.quality === 'restricted' ? 'restricted' : report.scan.quality === 'failed' ? 'failed' : 'partial';
  await db.transaction(async (tx) => {
    await tx.update(scans).set({ status, stages: data.stages, gathered: stripForStorage(data), report, finalUrl: data.http?.final?.url ?? null, screenshotPath: data.browser?.screenshot?.path ?? null, finishedAt: new Date(), durationMs: Date.now() - started, error: data.http?.error ?? null }).where(eq(scans.id, scanId));
    await tx.delete(scanTechnologies).where(eq(scanTechnologies.scanId, scanId));
    if (report.technologies.length) {
      await tx.insert(scanTechnologies).values(report.technologies.map((t) => ({ scanId, name: t.name, slug: t.slug, category: t.categories[0]?.name ?? null, version: t.version, confidence: t.confidence, implied: t.implied })));
    }
    await tx
      .insert(domains)
      .values({ registrableDomain: row.registrableDomain, scanCount: 1, latestScanId: scanId })
      .onConflictDoUpdate({ target: domains.registrableDomain, set: { lastScannedAt: new Date(), scanCount: sql`${domains.scanCount} + 1`, latestScanId: scanId } });
    // Restricted → cool down this domain so public users can't make us keep knocking.
    const httpStatus = data.http?.final?.status;
    if (data.http?.challenge || (httpStatus && isRestrictedStatus(httpStatus))) {
      await tx.update(domains).set({ cooldownUntil: new Date(Date.now() + LIMITS.restrictedCooldownMs), cooldownReason: data.http?.challenge ? `${data.http.challenge.vendor} challenge` : `HTTP ${httpStatus}` }).where(eq(domains.registrableDomain, row.registrableDomain));
    }
    await tx.update(workers).set({ currentScanId: null, lastSeenAt: new Date(), scansDone: sql`${workers.scansDone} + 1` }).where(eq(workers.id, config.workerId));
  });
  log.info({ scanId, host: row.host, status, ms: Date.now() - started, technologies: report.technologies.length }, 'scan finished');
}

/** Keep stored raw data useful for re-analysis but bounded: cap bodies, drop script contents we no longer need. */
function stripForStorage(d: GatheredData): GatheredData {
  const copy: GatheredData = JSON.parse(JSON.stringify(d));
  if (copy.http?.final && copy.http.final.body.length > LIMITS.maxHtmlBytes) copy.http.final.body = copy.http.final.body.slice(0, LIMITS.maxHtmlBytes);
  if (copy.browser && copy.browser.renderedHtml.length > LIMITS.maxHtmlBytes) copy.browser.renderedHtml = copy.browser.renderedHtml.slice(0, LIMITS.maxHtmlBytes);
  if (copy.files) for (const f of copy.files.scripts) if (f.body && f.body.length > 20_000) f.body = f.body.slice(0, 20_000);
  if (copy.external?.psi?.screenshotDataUrl && copy.browser?.screenshot) copy.external.psi.screenshotDataUrl = null;
  return copy;
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

async function heartbeat() {
  await db
    .insert(workers)
    .values({ id: config.workerId, role: 'scan', hostname: hostname(), version: SCANNER_VERSION, browser: config.browserEnabled, memoryMb: Math.round(process.memoryUsage().rss / 1048576) })
    .onConflictDoUpdate({ target: workers.id, set: { lastSeenAt: new Date(), memoryMb: Math.round(process.memoryUsage().rss / 1048576), browser: config.browserEnabled, version: SCANNER_VERSION } })
    .catch((e) => log.warn({ err: e.message }, 'heartbeat failed'));
}

async function housekeeping() {
  try {
    // Redact raw requester IPs after the retention window (hash + country stay).
    const cutoff = new Date(Date.now() - config.ipRetentionDays * 86_400_000);
    await db.update(lookups).set({ ip: null }).where(and(isNotNull(lookups.ip), lt(lookups.createdAt, cutoff)));
    // Expire cache rows.
    await db.delete(apiCache).where(lt(apiCache.expiresAt, new Date()));
    // Expire screenshots.
    const files = await readdir(config.screenshotDir).catch(() => [] as string[]);
    const maxAge = config.screenshotRetentionDays * 86_400_000;
    for (const f of files) {
      const p = join(config.screenshotDir, f);
      const s = await stat(p).catch(() => null);
      if (s && Date.now() - s.mtimeMs > maxAge) await unlink(p).catch(() => {});
    }
    // Forget dead workers.
    await db.delete(workers).where(lt(workers.lastSeenAt, new Date(Date.now() - 10 * 60_000)));
    // Requeue scans stuck in "running" for too long (worker crashed mid-scan).
    await db.update(scans).set({ status: 'failed', error: 'Worker stopped before the scan finished.', finishedAt: new Date() }).where(and(eq(scans.status, 'running'), lt(scans.startedAt, new Date(Date.now() - config.scanTimeoutMs * 2))));
  } catch (e) {
    log.warn({ err: (e as Error).message }, 'housekeeping failed');
  }
}

const worker = new Worker<{ scanId: string }>(SCAN_QUEUE, processScan, {
  connection,
  concurrency: config.scanConcurrency,
  lockDuration: config.scanTimeoutMs + 30_000,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 }
});
worker.on('failed', (job, err) => log.error({ scanId: job?.data.scanId, err: err.message }, 'job failed'));
worker.on('error', (err) => log.error({ err: err.message }, 'worker error'));

await heartbeat();
const hb = setInterval(heartbeat, 30_000);
const hk = setInterval(housekeeping, 15 * 60_000);
void housekeeping();

async function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  clearInterval(hb);
  clearInterval(hk);
  await worker.close();
  await closeBrowser();
  await db.delete(workers).where(eq(workers.id, config.workerId)).catch(() => {});
  await client.end({ timeout: 5 });
  await connection.quit();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
