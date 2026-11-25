/** Heartbeat and periodic upkeep: stuck-scan recovery, retention, cache and file expiry. */
import { Worker } from 'bullmq';
import { hostname } from 'node:os';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { and, domains, eq, isNotNull, lookups, lt, scans, sql, workers, apiCache } from '@site-scanner/db';
import { SCANNER_VERSION } from '@site-scanner/core';
import { config } from './config.js';
import { log } from './log.js';
import { db } from './runtime.js';
import { cache } from './adapters.js';

export async function heartbeat() {
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

export async function housekeeping() {
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
