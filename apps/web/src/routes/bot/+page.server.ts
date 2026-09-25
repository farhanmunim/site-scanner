import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { blocklist } from '@site-scanner/db';
import { normaliseTarget, TargetError } from '@site-scanner/core';
import { getDb } from '$lib/server/db.js';
import { rateLimitHit } from '$lib/server/redis.js';
import { hashIp } from '$lib/server/scan-service.js';

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const form = await request.formData();
    const raw = String(form.get('domain') ?? '').trim();
    const contact = String(form.get('contact') ?? '').trim().slice(0, 200) || null;
    if ((await rateLimitHit(`rl:optout:${hashIp(locals.clientIp)}`, 3600).catch(() => 0)) > 5) return fail(429, { error: 'Too many requests. Try again later.', domain: raw });
    let domain: string;
    try {
      domain = normaliseTarget(raw).registrableDomain;
    } catch (e) {
      return fail(400, { error: e instanceof TargetError ? e.message : 'Invalid domain', domain: raw });
    }
    await getDb().insert(blocklist).values({ domain, reason: 'Owner opt-out via /bot', source: 'opt-out', contact }).onConflictDoNothing();
    return { done: true, domain };
  }
};
