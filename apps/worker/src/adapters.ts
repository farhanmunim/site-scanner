/** Adapters that hand the scanner core its shared services: spending counters (Redis) and the API cache (Postgres). */
import { and, eq, gt, apiCache } from '@site-scanner/db';
import { connection, db } from './runtime.js';

/** Shared spending counters for the free APIs (see core external/quota.ts): one atomic INCR + EXPIRE, visible to every worker and to the admin page. */
export const quota = {
  async hit(key: string, ttlSec: number): Promise<number> {
    return Number(await connection.eval("local n=redis.call('INCR',KEYS[1]) if n==1 or redis.call('TTL',KEYS[1])<0 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end return n", 1, key, ttlSec));
  }
};

/** Cache adapter for external APIs, backed by Postgres. */
export const cache = {
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
