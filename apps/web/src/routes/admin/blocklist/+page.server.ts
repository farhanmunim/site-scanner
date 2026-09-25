import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { blocklist, desc, eq } from '@site-scanner/db';
import { normaliseTarget, TargetError, DEFAULT_DENY_SUFFIXES } from '@site-scanner/core';
import { getDb } from '$lib/server/db.js';
import { config } from '$lib/server/config.js';

export const load: PageServerLoad = async () => ({
  rows: await getDb().select().from(blocklist).orderBy(desc(blocklist.createdAt)).limit(500),
  denySuffixes: [...DEFAULT_DENY_SUFFIXES, ...config.denySuffixes]
});

export const actions: Actions = {
  add: async ({ request }) => {
    const form = await request.formData();
    const raw = String(form.get('domain') ?? '').trim();
    let domain: string;
    try {
      domain = normaliseTarget(raw).registrableDomain;
    } catch (e) {
      return fail(400, { error: e instanceof TargetError ? e.message : 'Invalid domain' });
    }
    await getDb().insert(blocklist).values({ domain, reason: String(form.get('reason') ?? '').slice(0, 300) || null, source: 'admin' }).onConflictDoNothing();
    return { ok: true };
  },
  remove: async ({ request }) => {
    const id = Number((await request.formData()).get('id'));
    if (!Number.isInteger(id)) return fail(400, { error: 'bad id' });
    await getDb().delete(blocklist).where(eq(blocklist.id, id));
    return { ok: true };
  }
};
