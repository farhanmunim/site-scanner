import type { PageServerLoad } from './$types';
import { count, desc, eq, scanTechnologies, scans, sql } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';

/** Faceted view: which sites use technology X / category Y, and the leaderboard. */
export const load: PageServerLoad = async ({ url }) => {
  const db = getDb();
  const name = url.searchParams.get('name')?.trim() ?? '';
  const category = url.searchParams.get('category')?.trim() ?? '';
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days') ?? 30)));
  const since = new Date(Date.now() - days * 86_400_000);
  const leaderboard = await db
    .select({ name: scanTechnologies.name, category: scanTechnologies.category, sites: sql<number>`count(distinct ${scans.registrableDomain})`, scansN: count() })
    .from(scanTechnologies)
    .innerJoin(scans, eq(scans.id, scanTechnologies.scanId))
    .where(sql`${scans.createdAt} > ${since.toISOString()} and ${scanTechnologies.implied} = false ${category ? sql`and ${scanTechnologies.category} = ${category}` : sql``}`)
    .groupBy(scanTechnologies.name, scanTechnologies.category)
    .orderBy(desc(sql`count(distinct ${scans.registrableDomain})`))
    .limit(100);
  const categories = await db.select({ category: scanTechnologies.category, n: count() }).from(scanTechnologies).groupBy(scanTechnologies.category).orderBy(desc(count())).limit(60);
  const sites = name
    ? await db
        .selectDistinctOn([scans.registrableDomain], { domain: scans.registrableDomain, host: scans.displayHost, scanId: scans.id, version: scanTechnologies.version, confidence: scanTechnologies.confidence, createdAt: scans.createdAt })
        .from(scanTechnologies)
        .innerJoin(scans, eq(scans.id, scanTechnologies.scanId))
        .where(sql`${scanTechnologies.name} = ${name} and ${scans.createdAt} > ${since.toISOString()}`)
        .orderBy(scans.registrableDomain, desc(scans.createdAt))
        .limit(200)
    : [];
  return { leaderboard, categories, sites, name, category, days };
};
