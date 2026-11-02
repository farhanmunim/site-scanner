/** Process-wide services: database (migrated on start), Redis connection and the fingerprint database. */
import IORedis from 'ioredis';
import { createDb, eq, runMigrations, settings } from '@site-scanner/db';
import { loadFingerprints } from '@site-scanner/core';
import { config } from './config.js';

export const { db, client } = createDb(config.databaseUrl, { max: 4 });
await runMigrations(config.databaseUrl);
export const { version: fingerprintsVersion, db: fpDb } = loadFingerprints();

export const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return (row[0]?.value as T | undefined) ?? fallback;
}
