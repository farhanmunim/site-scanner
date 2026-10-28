import type { PageServerLoad } from './$types';
import { desc, ilike, lookups, or, sql } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';

const PAGE = 50;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim() ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const where = q ? or(ilike(lookups.input, `%${q}%`), ilike(lookups.host, `%${q}%`), ilike(lookups.ipHash, `${q}%`), sql`${lookups.ip} = ${q}`) : undefined;
  const rows = await getDb().select().from(lookups).where(where).orderBy(desc(lookups.createdAt)).limit(PAGE).offset((page - 1) * PAGE);
  return { rows, q, page, more: rows.length === PAGE };
};
