import type { PageServerLoad } from './$types';
import { count, sql, scans, workers, lookups } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';
import { getQueue, getRedis } from '$lib/server/redis.js';
import { config } from '$lib/server/config.js';

export const load: PageServerLoad = async () => {
  const db = getDb();
  const [ws, dbSizeRows, [queuedScans], tableRows, egress] = await Promise.all([
    db.select().from(workers),
    db.execute<{ size: string }>(sql`select pg_size_pretty(pg_database_size(current_database())) as size`).then((r) => r as unknown as { size: string }[]),
    db.select({ n: count() }).from(scans).where(sql`${scans.status} in ('queued','running')`),
    db.execute<{ table: string; rows: number }>(sql`select relname as "table", n_live_tup as rows from pg_stat_user_tables order by n_live_tup desc`).then((r) => r as unknown as { table: string; rows: number }[]),
    fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) })
      .then((r) => r.json() as Promise<{ ip: string }>)
      .then((j) => j.ip)
      .catch(() => null)
  ]);
  let redis: { ok: boolean; queue?: Record<string, number> } = { ok: false };
  try {
    await getRedis().ping();
    const q = getQueue();
    redis = { ok: true, queue: await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed') };
  } catch {
    /* shown as down */
  }
  const [oldestIp] = await db.select({ t: sql<string>`min(${lookups.createdAt})` }).from(lookups).where(sql`${lookups.ip} is not null`);
  return { workers: ws, dbSize: dbSizeRows[0]?.size ?? '?', queuedScans: queuedScans!.n, tables: tableRows, egress, redis, oldestIp: oldestIp?.t ?? null, ownIpsConfigured: config.ownHosts.length > 0 };
};
