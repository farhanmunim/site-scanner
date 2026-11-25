import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq, scans } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';
import { withScores } from '$lib/server/report-compat.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The document the PDF export renders: plain, compact, black and white with traffic-light status colours. */
export const load: PageServerLoad = async ({ params }) => {
  if (!UUID.test(params.id)) error(404, { message: 'Report not found' });
  const [row] = await getDb().select({ id: scans.id, scope: scans.scope, status: scans.status, report: scans.report, error: scans.error, createdAt: scans.createdAt, durationMs: scans.durationMs, displayHost: scans.displayHost, url: scans.url }).from(scans).where(eq(scans.id, params.id)).limit(1);
  if (!row) error(404, { message: 'Report not found' });
  return { scan: withScores(row) };
};
