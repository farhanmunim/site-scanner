import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSession, verifyPassword, verifyTotp } from '$lib/server/auth.js';
import { rateLimitHit } from '$lib/server/redis.js';
import { hashIp } from '$lib/server/scan-service.js';
import { config } from '$lib/server/config.js';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.admin) redirect(303, '/admin');
  return { configured: !!config.adminPasswordHash && !!config.sessionSecret, totp: !!config.adminTotpSecret };
};

export const actions: Actions = {
  default: async ({ request, cookies, locals, url }) => {
    if (!config.adminPasswordHash || !config.sessionSecret) return fail(500, { error: 'Admin login is not configured (set ADMIN_PASSWORD_HASH and SESSION_SECRET).' });
    // Throttle: 8 attempts per IP per 15 minutes.
    if ((await rateLimitHit(`rl:login:${hashIp(locals.clientIp)}`, 900).catch(() => 0)) > 8) return fail(429, { error: 'Too many attempts. Wait 15 minutes.' });
    const form = await request.formData();
    const password = String(form.get('password') ?? '');
    const code = String(form.get('code') ?? '');
    // Constant-ish time: always verify both.
    const okPw = verifyPassword(password);
    const okTotp = verifyTotp(code);
    if (!okPw || !okTotp) return fail(401, { error: 'Incorrect password or code.' });
    createSession(cookies);
    const next = url.searchParams.get('next');
    redirect(303, next && next.startsWith('/admin') ? next : '/admin');
  }
};
