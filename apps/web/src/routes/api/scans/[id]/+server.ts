import { json, type RequestHandler } from '@sveltejs/kit';
import { eq, scans } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';
import { withScores } from '$lib/server/report-compat.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/scans/:id → { status, stages, report } (report is partial until status is final). ?lite=1 omits the report. */
export const GET: RequestHandler = async ({ params, url }) => {
  if (!UUID.test(params.id!)) return json({ error: 'Not found' }, { status: 404 });
  const [row] = await getDb().select({ id: scans.id, scope: scans.scope, status: scans.status, stages: scans.stages, report: scans.report, error: scans.error, createdAt: scans.createdAt, finishedAt: scans.finishedAt, durationMs: scans.durationMs, host: scans.host, url: scans.url }).from(scans).where(eq(scans.id, params.id!)).limit(1);
  if (!row) return json({ error: 'Not found' }, { status: 404 });
  const done = !['queued', 'running'].includes(row.status);
  const lite = url.searchParams.get('lite') === '1';
  return json(lite ? { ...row, report: null } : withScores(row), { headers: { 'cache-control': done ? 'private, max-age=300' : 'no-store' } });
};
