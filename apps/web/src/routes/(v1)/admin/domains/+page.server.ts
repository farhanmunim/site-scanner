import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { desc, domains, eq, ilike } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim() ?? '';
  const rows = await getDb()
    .select()
    .from(domains)
    .where(q ? ilike(domains.registrableDomain, `%${q}%`) : undefined)
    .orderBy(desc(domains.lastScannedAt))
    .limit(200);
  return { rows, q };
};

export const actions: Actions = {
  clearCooldown: async ({ request }) => {
    const d = String((await request.formData()).get('domain') ?? '');
    if (!d) return fail(400, { error: 'missing domain' });
    await getDb().update(domains).set({ cooldownUntil: null, cooldownReason: null }).where(eq(domains.registrableDomain, d));
    return { ok: true };
  }
};
