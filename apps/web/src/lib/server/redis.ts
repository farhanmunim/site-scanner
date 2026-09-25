import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { config, SCAN_QUEUE } from './config.js';

let redis: IORedis | null = null;
let queue: Queue<{ scanId: string }> | null = null;
let pdfQueue: Queue<{ scanId: string }> | null = null;

export function getRedis(): IORedis {
  if (!redis) redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 2 });
  return redis;
}

export function getQueue(): Queue<{ scanId: string }> {
  if (!queue) queue = new Queue(SCAN_QUEUE, { connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }), defaultJobOptions: { attempts: 1, removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 } } });
  return queue;
}

export function getPdfQueue(): Queue<{ scanId: string }> {
  if (!pdfQueue) pdfQueue = new Queue('pdf', { connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }), defaultJobOptions: { attempts: 1, removeOnComplete: { count: 200 }, removeOnFail: { count: 200 } } });
  return pdfQueue;
}

/** Sliding-window-ish counter: INCR with TTL. Returns the count after increment. */
export async function rateLimitHit(key: string, windowSec: number): Promise<number> {
  const r = getRedis();
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, windowSec);
  return n;
}
