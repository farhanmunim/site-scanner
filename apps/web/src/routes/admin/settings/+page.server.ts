import type { Actions, PageServerLoad } from './$types';
import { settings, SETTINGS_KEYS } from '@site-scanner/db';
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
  const rows = await getDb().select().from(settings);
  const values = { ...DEFAULTS };
  for (const r of rows) values[r.key] = r.value;
  return { values, keys: SETTINGS_KEYS };
};

export const actions: Actions = {
  default: async ({ request }) => {
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
