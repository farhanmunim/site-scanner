import { config } from '$lib/server/config';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq, scans } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';
import { withScores } from '$lib/server/report-compat.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params, url }) => {
  if (!UUID.test(params.id)) error(404, { message: 'Report not found' });
  const [row] = await getDb().select({ id: scans.id, status: scans.status, stages: scans.stages, report: scans.report, error: scans.error, createdAt: scans.createdAt, finishedAt: scans.finishedAt, durationMs: scans.durationMs, host: scans.host, displayHost: scans.displayHost, url: scans.url }).from(scans).where(eq(scans.id, params.id)).limit(1);
  if (!row) error(404, { message: 'Report not found' });
  return { scan: withScores(row), notice: url.searchParams.get('notice'), print: url.searchParams.get('print') === '1', siteHost: new URL(config.publicSiteUrl).hostname };
};
