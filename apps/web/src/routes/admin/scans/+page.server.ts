import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, desc, eq, ilike, scans, sql } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';
import { requestScan } from '$lib/server/scan-service.js';

const PAGE = 50;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim() ?? '';
  const status = url.searchParams.get('status') ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const where = and(q ? ilike(scans.host, `%${q}%`) : undefined, status ? eq(scans.status, status as never) : undefined);
  const rows = await getDb()
    .select({ id: scans.id, host: scans.displayHost, url: scans.url, status: scans.status, createdAt: scans.createdAt, durationMs: scans.durationMs, error: scans.error, country: scans.requesterCountry, techCount: sql<number>`coalesce(jsonb_array_length(${scans.report}->'technologies'), 0)` })
    .from(scans)
    .where(where)
    .orderBy(desc(scans.createdAt))
    .limit(PAGE)
    .offset((page - 1) * PAGE);
  return { rows, q, status, page, more: rows.length === PAGE };
};

export const actions: Actions = {
  rescan: async ({ request, locals }) => {
    const form = await request.formData();
    const url = String(form.get('url') ?? '');
    const r = await requestScan({ input: url, ip: locals.clientIp, country: locals.country, userAgent: 'admin', referrer: null, source: 'admin', force: true });
    if (!r.ok) return fail(r.status, { error: r.error });
    return { scanId: r.scanId };
  },
  delete: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return fail(400, { error: 'bad id' });
    await getDb().delete(scans).where(eq(scans.id, id));
    return { deleted: id };
  }
};
