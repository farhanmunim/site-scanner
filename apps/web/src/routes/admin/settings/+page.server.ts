import type { Actions, PageServerLoad } from './$types';
import { and, apiCache, domains, inArray, lookups, lt, scans, settings, SETTINGS_KEYS, sql } from '@site-scanner/db';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '$lib/server/config.js';
import { LIMITS } from '@site-scanner/core';
import { getDb } from '$lib/server/db.js';

const DEFAULTS: Record<string, unknown> = {
  [SETTINGS_KEYS.scanningPaused]: false,
  [SETTINGS_KEYS.maxScansPerDomainPerHour]: LIMITS.maxScansPerDomainPerHour,
  [SETTINGS_KEYS.maxScansPerIpPerHour]: LIMITS.maxScansPerIpPerHour,
  [SETTINGS_KEYS.cacheWindowMinutes]: LIMITS.cacheWindowMs / 60000,
  [SETTINGS_KEYS.browserEnabled]: true,
  [SETTINGS_KEYS.externalEnabled]: true
};

export const load: PageServerLoad = async () => {
  const db = getDb();
  const rows = await db.select().from(settings);
  const [counts] = await db.execute<{ lookups: number; scans: number; domains: number; cache: number }>(sql`select (select count(*) from lookups)::int as lookups, (select count(*) from scans where status not in ('queued','running'))::int as scans, (select count(*) from domains)::int as domains, (select count(*) from api_cache)::int as cache`);
  const values = { ...DEFAULTS };
  for (const r of rows) values[r.key] = r.value;
  return { values, keys: SETTINGS_KEYS, counts: counts ?? { lookups: 0, scans: 0, domains: 0, cache: 0 } };
};

/** Remove stored screenshots and PDFs that no longer belong to a stored scan (or all of them). */
async function removeFiles(keepIds: Set<string> | null) {
  const dirs = [config.screenshotDir, config.pdfDir];
  for (const dir of dirs) {
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const id = name.replace(/\.(jpg|jpeg|png|pdf)$/i, '');
      if (!/^[0-9a-f-]{36}$/.test(id)) continue;
      if (keepIds && keepIds.has(id)) continue;
      await rm(join(dir, name), { force: true });
    }
  }
}

const OLDER_THAN_DAYS = new Set(['7', '30', '90', '365']);

export const actions: Actions = {
  purge: async ({ request }) => {
    const form = await request.formData();
    const what = String(form.get('what') ?? '');
    const olderThan = String(form.get('older_than') ?? 'all');
    if (String(form.get('confirm') ?? '').trim().toUpperCase() !== 'DELETE') return { purgeError: 'Type DELETE to confirm.' };
    const db = getDb();
    const cutoff = OLDER_THAN_DAYS.has(olderThan) ? new Date(Date.now() - Number(olderThan) * 86_400_000) : null;
    let removed = 0;
    if (what === 'lookups' || what === 'everything') {
      const r = cutoff ? await db.delete(lookups).where(lt(lookups.createdAt, cutoff)).returning({ id: lookups.id }) : await db.delete(lookups).returning({ id: lookups.id });
      removed += r.length;
    }
    if (what === 'scans' || what === 'everything') {
      // Never delete a scan that is still being worked on.
      const finished = inArray(scans.status, ['complete', 'partial', 'restricted', 'failed']);
      const r = await db.delete(scans).where(cutoff ? and(finished, lt(scans.createdAt, cutoff)) : finished).returning({ id: scans.id });
      removed += r.length;
      const remaining = await db.select({ id: scans.id }).from(scans);
      await removeFiles(new Set(remaining.map((x) => x.id)));
      if (!cutoff) await db.delete(domains);
      else await db.execute(sql`delete from domains d where not exists (select 1 from scans s where s.registrable_domain = d.registrable_domain)`);
    }
    if (what === 'cache' || what === 'everything') {
      const r = await db.delete(apiCache).returning({ key: apiCache.key });
      removed += r.length;
    }
    if (!['lookups', 'scans', 'cache', 'everything'].includes(what)) return { purgeError: 'Choose what to delete.' };
    return { purged: { what, removed, olderThan: cutoff ? olderThan : 'all' } };
  },
  save: async ({ request }) => {
    const form = await request.formData();
    const db = getDb();
    const put = async (key: string, value: unknown) => db.insert(settings).values({ key, value: value as object }).onConflictDoUpdate({ target: settings.key, set: { value: value as object, updatedAt: new Date() } });
    await put(SETTINGS_KEYS.scanningPaused, form.get('paused') === 'on');
    await put(SETTINGS_KEYS.browserEnabled, form.get('browser') === 'on');
    await put(SETTINGS_KEYS.externalEnabled, form.get('external') === 'on');
    for (const [k, min, max] of [[SETTINGS_KEYS.maxScansPerDomainPerHour, 1, 60], [SETTINGS_KEYS.maxScansPerIpPerHour, 1, 500], [SETTINGS_KEYS.cacheWindowMinutes, 0, 1440]] as const) {
      const n = Number(form.get(k));
      if (Number.isFinite(n)) await put(k, Math.min(max, Math.max(min, Math.round(n))));
    }
    return { saved: true };
  }
};
