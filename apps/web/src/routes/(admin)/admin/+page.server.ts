import type { PageServerLoad } from './$types';
import { count, desc, eq, gt, lookups, scanTechnologies, scans, sql, workers } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';

export const load: PageServerLoad = async () => {
  const db = getDb();
  const day = new Date(Date.now() - 86_400_000);
  const week = new Date(Date.now() - 7 * 86_400_000);
  const [[l24], [l7], [s24], [sAll], [cached24], [failed24], recent, topTech, topDomains, activeWorkers, [queued]] = await Promise.all([
    db.select({ n: count() }).from(lookups).where(gt(lookups.createdAt, day)),
    db.select({ n: count() }).from(lookups).where(gt(lookups.createdAt, week)),
    db.select({ n: count() }).from(scans).where(gt(scans.createdAt, day)),
    db.select({ n: count() }).from(scans),
    db.select({ n: count() }).from(lookups).where(sql`${lookups.createdAt} > ${day.toISOString()} and ${lookups.cacheHit} = true`),
    db.select({ n: count() }).from(scans).where(sql`${scans.createdAt} > ${day.toISOString()} and ${scans.status} = 'failed'`),
    db.select({ id: scans.id, host: scans.displayHost, status: scans.status, createdAt: scans.createdAt, durationMs: scans.durationMs, country: scans.requesterCountry }).from(scans).orderBy(desc(scans.createdAt)).limit(12),
    db
      .select({ name: scanTechnologies.name, n: count() })
      .from(scanTechnologies)
      .innerJoin(scans, eq(scans.id, scanTechnologies.scanId))
      .where(sql`${scans.createdAt} > ${week.toISOString()} and ${scanTechnologies.implied} = false`)
      .groupBy(scanTechnologies.name)
      .orderBy(desc(count()))
      .limit(15),
    db.select({ domain: lookups.registrableDomain, n: count() }).from(lookups).where(sql`${lookups.createdAt} > ${week.toISOString()} and ${lookups.registrableDomain} is not null`).groupBy(lookups.registrableDomain).orderBy(desc(count())).limit(10),
    db.select().from(workers).where(gt(workers.lastSeenAt, new Date(Date.now() - 2 * 60_000))),
    db.select({ n: count() }).from(scans).where(sql`${scans.status} in ('queued','running')`)
  ]);
  return { stats: { lookups24: l24!.n, lookups7: l7!.n, scans24: s24!.n, scansAll: sAll!.n, cached24: cached24!.n, failed24: failed24!.n, queued: queued!.n, workers: activeWorkers.length }, recent, topTech, topDomains, workers: activeWorkers };
};
