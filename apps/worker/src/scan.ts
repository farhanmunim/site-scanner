/** One scan job: gather, analyse after each stage, store, and mark the outcome. */
import { type Job } from 'bullmq';
import { and, blocklist, domains, eq, scans, scanTechnologies, SETTINGS_KEYS, sql, workers } from '@site-scanner/db';
import { gather, prepareTarget, ScanRefused, LIMITS, isRestrictedStatus, SCANNER_VERSION, type GatheredData, type StageName } from '@site-scanner/core';
import { config } from './config.js';
import { log } from './log.js';
import { renderPage } from './browser.js';
import { analyseInThread } from './analyse-runner.js';
import { db, fingerprintsVersion, getSetting } from './runtime.js';
import { cache, quota } from './adapters.js';
import { storeMedia } from './media.js';
import { clean, publicError, stripForStorage } from './sanitize.js';
import { housekeeping } from './housekeeping.js';

export async function processScan(job: Job<{ scanId: string }>): Promise<void> {
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
