import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { hostname } from 'node:os';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, blocklist, createDb, domains, eq, gt, isNotNull, lookups, lt, runMigrations, scans, scanTechnologies, settings, SETTINGS_KEYS, sql, workers, apiCache, type Db } from '@site-scanner/db';
import { gather, stripNul, loadFingerprints, prepareTarget, ScanRefused, LIMITS, isRestrictedStatus, SCANNER_VERSION, type GatheredData, type StageName } from '@site-scanner/core';
import { config, PDF_QUEUE, SCAN_QUEUE } from './config.js';
import { log } from './log.js';
import { closeBrowser, renderPage } from './browser.js';
import { closePdfBrowser, renderPdf } from './pdf.js';
import { analyseInThread, stopAnalyseThread } from './analyse-runner.js';

/**
 * Scan worker. Consumes `scan` jobs, runs gather → analyse, writes progress to Postgres
 * after every stage so the web app can show partial results, and records aggregates for
 * the owner's admin console. Also runs housekeeping (IP redaction, screenshot expiry).
 */

const { db, client } = createDb(config.databaseUrl, { max: 4 });
await runMigrations(config.databaseUrl);
const { version: fingerprintsVersion, db: fpDb } = loadFingerprints();
log.info({ technologies: Object.keys(fpDb).length, fingerprintsVersion, browser: config.browserEnabled }, 'worker starting');

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return (row[0]?.value as T | undefined) ?? fallback;
}

/** Shared spending counters for the free APIs (see core external/quota.ts): one atomic INCR + EXPIRE, visible to every worker and to the admin page. */
const quota = {
  async hit(key: string, ttlSec: number): Promise<number> {
    return Number(await connection.eval("local n=redis.call('INCR',KEYS[1]) if n==1 or redis.call('TTL',KEYS[1])<0 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end return n", 1, key, ttlSec));
  }
};

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
  if (row.status === 'running') {
    // BullMQ redelivered a job whose worker died mid-scan. Re-running could double-count; fail it now so the
    // user can retry immediately instead of waiting for housekeeping.
    log.warn({ scanId }, 'scan was running when its worker stopped; marking failed');
    await db.update(scans).set({ status: 'failed', error: 'The scanner restarted during this scan. Please run it again.', finishedAt: new Date() }).where(and(eq(scans.id, scanId), eq(scans.status, 'running')));
    return;
  }
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

  let settled = false;
  // Stages that change what the report can show. The cheap ones (rdap, cert, dns) ride along with the next write.
  const PROGRESS_STAGES = new Set<StageName>(['http', 'files', 'browser', 'external']);
  const persist = async (stage: StageName, data: GatheredData) => {
    await storeMedia(scanId, data);
    if (settled) return; // the scan already timed out and was marked failed: never overwrite that
    if (!PROGRESS_STAGES.has(stage)) {
      await db.update(scans).set({ stages: data.stages }).where(eq(scans.id, scanId)).catch(() => {});
      return;
    }
    let report;
    try {
      report = await analyseInThread(data);
    } catch (e) {
      log.error({ scanId, stage, err: (e as Error).message }, 'analyse failed');
      return;
    }
    if (settled) return;
    await db.update(scans).set({ stages: data.stages, gathered: stripForStorage(data), report: clean(report), finalUrl: data.http?.final?.url ?? null, screenshotPath: data.browser?.screenshot?.path ?? null }).where(eq(scans.id, scanId));
    log.info({ scanId, stage, status: data.stages[stage].status, ms: data.stages[stage].durationMs }, 'stage done');
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`Scan exceeded ${config.scanTimeoutMs / 1000}s`)), config.scanTimeoutMs)));
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
        scope: row.scope,
        external: externalEnabled ? { googleApiKey: config.googleApiKey, wordfenceApiKey: config.wordfenceApiKey, virustotalKey: config.virustotalKey, abuseipdbKey: config.abuseipdbKey, otxKey: config.otxKey, urlhausKey: config.urlhausKey, quota, psi: config.psiEnabled, safeBrowsing: config.safeBrowsingEnabled, wordpress: config.wordpressApisEnabled, cache } : { quota, psi: false, safeBrowsing: false, wordpress: false, wayback: false, greenWeb: false, subdomains: false, retire: false, blocklists: false, propagation: false, internetDb: false, eol: false, osv: false, tranco: false, geo: false, crux: false, reputation: false },
        onStage: (stage, d) => persist(stage, d),
        browser: browserEnabled ? renderPage : undefined
      }),
      timeout
    ]);
  } catch (e) {
    settled = true;
    clearTimeout(timer);
    const msg = publicError(e);
    log.error({ scanId, err: (e as Error).message }, 'scan failed');
    await db.update(scans).set({ status: 'failed', error: msg, finishedAt: new Date(), durationMs: Date.now() - started }).where(eq(scans.id, scanId));
    await db.update(workers).set({ currentScanId: null }).where(eq(workers.id, config.workerId)).catch(() => {});
    return;
  }
  settled = true;
  clearTimeout(timer);

  await storeMedia(scanId, data);
  let report: Awaited<ReturnType<typeof analyseInThread>>;
  try {
    report = clean(await analyseInThread(data, 40_000));
  } catch (e) {
    log.error({ scanId, err: (e as Error).message }, 'final analyse failed');
    await db.update(scans).set({ status: 'failed', error: publicError(e), finishedAt: new Date(), durationMs: Date.now() - started }).where(eq(scans.id, scanId));
    await db.update(workers).set({ currentScanId: null }).where(eq(workers.id, config.workerId)).catch(() => {});
    return;
  }
  const status = report.scan.quality === 'complete' ? 'complete' : report.scan.quality === 'restricted' ? 'restricted' : report.scan.quality === 'failed' ? 'failed' : 'partial';
  try {
  await db.transaction(async (tx) => {
    await tx.update(scans).set({ status, stages: data.stages, gathered: stripForStorage(data), report, finalUrl: data.http?.final?.url ?? null, screenshotPath: data.browser?.screenshot?.path ?? null, finishedAt: new Date(), durationMs: Date.now() - started, error: data.http?.error ?? null }).where(eq(scans.id, scanId));
    await tx.delete(scanTechnologies).where(eq(scanTechnologies.scanId, scanId));
    if (report.technologies.length) {
      await tx.insert(scanTechnologies).values(report.technologies.map((t) => ({ scanId, name: t.name, slug: t.slug, category: t.categories[0]?.name ?? null, version: t.version, confidence: t.confidence, implied: t.implied })));
    }
    await tx
      .insert(domains)
      .values({ registrableDomain: row.registrableDomain, scanCount: 1, latestScanId: row.scope === 'full' ? scanId : null })
      // Only a full scan becomes "the latest result": it is what rate-limited and cooled-down requests are shown.
      .onConflictDoUpdate({ target: domains.registrableDomain, set: { lastScannedAt: new Date(), scanCount: sql`${domains.scanCount} + 1`, ...(row.scope === 'full' ? { latestScanId: scanId } : {}) } });
    // Restricted → cool down this domain so public users can't make us keep knocking.
    const httpStatus = data.http?.final?.status;
    if (data.http?.challenge || (httpStatus && isRestrictedStatus(httpStatus))) {
      await tx.update(domains).set({ cooldownUntil: new Date(Date.now() + LIMITS.restrictedCooldownMs), cooldownReason: data.http?.challenge ? `${data.http.challenge.vendor} challenge` : `HTTP ${httpStatus}` }).where(eq(domains.registrableDomain, row.registrableDomain));
    }
    await tx.update(workers).set({ currentScanId: null, lastSeenAt: new Date(), scansDone: sql`${workers.scansDone} + 1` }).where(eq(workers.id, config.workerId));
  });
  } catch (e) {
    log.error({ scanId, err: (e as Error).message }, 'could not store the finished scan');
    await db.update(scans).set({ status: 'failed', error: 'The result could not be stored. Please run the scan again.', finishedAt: new Date(), durationMs: Date.now() - started }).where(eq(scans.id, scanId)).catch(() => {});
    await db.update(workers).set({ currentScanId: null }).where(eq(workers.id, config.workerId)).catch(() => {});
    return;
  }
  log.info({ scanId, host: row.host, status, ms: Date.now() - started, technologies: report.technologies.length }, 'scan finished');
}

const OG_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * The share image goes to the screenshots volume (served by /screenshots) instead of the database: up to 600 KB per
 * scan would bloat jsonb. The favicon is tiny and stays inline.
 */
async function storeMedia(scanId: string, data: GatheredData): Promise<void> {
  const og = data.files?.media?.ogImage;
  if (!og?.base64) return;
  const ext = OG_EXT[og.contentType];
  if (ext) {
    try {
      await mkdir(config.screenshotDir, { recursive: true });
      const file = `${scanId}-og.${ext}`;
      await writeFile(join(config.screenshotDir, file), Buffer.from(og.base64, 'base64'));
      og.path = file;
    } catch (e) {
      log.warn({ scanId, err: (e as Error).message }, 'could not store the share image');
    }
  }
  delete og.base64;
}

const clean = stripNul;

/** Errors shown publicly on /r/:id: never leak driver or filesystem detail. */
function publicError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/^Scan exceeded|^Analysis took too long/.test(m)) return m;
  return 'The scan could not be completed. Please try again.';
}

/** Keep stored raw data useful for re-analysis but bounded: cap bodies, drop script contents we no longer need. */
function stripForStorage(d: GatheredData): GatheredData {
  const copy: GatheredData = clean(d);
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

async function step(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    log.warn({ step: name, err: (e as Error).message }, 'housekeeping step failed');
  }
}

async function housekeeping() {
  const day = 86_400_000;
  // Each step is isolated: one bad setting must not stop stuck-scan recovery.
  await step('recover-stuck', async () => {
    await db.update(scans).set({ status: 'failed', error: 'Worker stopped before the scan finished.', finishedAt: new Date() }).where(and(eq(scans.status, 'running'), lt(scans.startedAt, new Date(Date.now() - config.scanTimeoutMs * 2))));
    // Queued rows whose job vanished (Redis restart) would otherwise block the same URL forever.
    await db.update(scans).set({ status: 'failed', error: 'The scan was never started. Please run it again.', finishedAt: new Date() }).where(and(eq(scans.status, 'queued'), lt(scans.createdAt, new Date(Date.now() - 10 * 60_000))));
  });
  await step('redact-ips', async () => {
    const days = Number.isFinite(config.ipRetentionDays) ? config.ipRetentionDays : 30;
    await db.update(lookups).set({ ip: null }).where(and(isNotNull(lookups.ip), lt(lookups.createdAt, new Date(Date.now() - days * day))));
  });
  await step('retention', async () => {
    const days = Number.isFinite(config.dataRetentionDays) ? config.dataRetentionDays : 365;
    if (days <= 0) return;
    const cutoff = new Date(Date.now() - days * day);
    await db.delete(lookups).where(lt(lookups.createdAt, cutoff));
    // Old finished scans go too, except the one a domain still points at as its latest result.
    await db.execute(sql`delete from scans s where s.created_at < ${cutoff.toISOString()}::timestamptz and s.status in ('complete','partial','restricted','failed') and not exists (select 1 from domains d where d.latest_scan_id = s.id)`);
  });
  await step('api-cache', () => db.delete(apiCache).where(lt(apiCache.expiresAt, new Date())));
  await step('files', async () => {
    const maxAge = (Number.isFinite(config.screenshotRetentionDays) ? config.screenshotRetentionDays : 90) * day;
    for (const dir of [config.screenshotDir, config.pdfDir]) {
      const files = await readdir(dir).catch(() => [] as string[]);
      for (const f of files) {
        const p = join(dir, f);
        const s = await stat(p).catch(() => null);
        if (s?.isFile() && Date.now() - s.mtimeMs > maxAge) await unlink(p).catch(() => {});
      }
    }
  });
  await step('workers', () => db.delete(workers).where(lt(workers.lastSeenAt, new Date(Date.now() - 10 * 60_000))));
}

const worker = new Worker<{ scanId: string }>(SCAN_QUEUE, processScan, {
  connection,
  concurrency: config.scanConcurrency,
  lockDuration: config.scanTimeoutMs + 30_000,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 }
});
worker.on('failed', (job, err) => log.error({ scanId: job?.data.scanId, err: err.message }, 'job failed'));

const pdfWorker = new Worker<{ scanId: string }>(PDF_QUEUE, async (job) => {
  await renderPdf(job.data.scanId);
}, { connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }), concurrency: 1, lockDuration: 90_000 });
pdfWorker.on('failed', (job, err) => log.error({ scanId: job?.data.scanId, err: err.message }, 'pdf job failed'));
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
  await pdfWorker.close();
  await closeBrowser();
  await stopAnalyseThread();
  await closePdfBrowser();
  await db.delete(workers).where(eq(workers.id, config.workerId)).catch(() => {});
  await client.end({ timeout: 5 });
  await connection.quit();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
