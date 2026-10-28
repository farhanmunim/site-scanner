import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminConfigured, createSession, verifyCredentials, verifyTotp } from '$lib/server/auth.js';
import { rateLimitHit } from '$lib/server/redis.js';
import { hashIp } from '$lib/server/scan-service.js';
import { config } from '$lib/server/config.js';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.admin) redirect(303, '/admin');
  return { configured: adminConfigured(), totp: !!config.adminTotpSecret };
};

export const actions: Actions = {
  default: async ({ request, cookies, locals, url }) => {
    if (!adminConfigured()) return fail(500, { error: 'Admin login is not configured: set ADMIN_USERNAME and ADMIN_PASSWORD (8+ characters).' });
    // Throttle: 8 attempts per IP per 15 minutes.
    if ((await rateLimitHit(`rl:login:${hashIp(locals.clientIp)}`, 900).catch(() => 0)) > 8) return fail(429, { error: 'Too many attempts. Wait 15 minutes.' });
    const form = await request.formData();
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');
    const code = String(form.get('code') ?? '');
    const okCreds = verifyCredentials(username, password);
    const okTotp = verifyTotp(code);
    if (!okCreds || !okTotp) return fail(401, { error: 'Incorrect username, password or code.' });
    createSession(cookies);
    const next = url.searchParams.get('next');
    redirect(303, next && next.startsWith('/admin') ? next : '/admin');
  }
};
