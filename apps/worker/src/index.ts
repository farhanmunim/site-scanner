/**
 * Scan worker. Consumes `scan` jobs, runs gather → analyse, writes progress to Postgres
 * after every stage so the web app can show partial results, and records aggregates for
 * the owner's admin console. Also runs housekeeping (IP redaction, screenshot expiry).
 */

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { eq, workers } from '@site-scanner/db';
import { config, PDF_QUEUE, SCAN_QUEUE } from './config.js';
import { log } from './log.js';
import { closeBrowser } from './browser.js';
import { closePdfBrowser, renderPdf } from './pdf.js';
import { stopAnalyseThread } from './analyse-runner.js';
import { client, connection, db, fingerprintsVersion, fpDb } from './runtime.js';
import { processScan } from './scan.js';
import { heartbeat, housekeeping } from './housekeeping.js';

log.info({ technologies: Object.keys(fpDb).length, fingerprintsVersion, browser: config.browserEnabled }, 'worker starting');

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
