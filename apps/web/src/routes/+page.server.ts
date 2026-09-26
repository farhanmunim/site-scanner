import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requestScan } from '$lib/server/scan-service.js';

/** `/?url=example.com` prefills the form (used by "scan another site" links). */
export const load: PageServerLoad = ({ url }) => ({ prefill: url.searchParams.get('url')?.slice(0, 2048) ?? '' });

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const form = await request.formData();
    const input = String(form.get('url') ?? '').trim();
    if (!input) return fail(400, { error: 'Enter a website address.', input });
    const result = await requestScan({
      input,
      ip: locals.clientIp,
      country: locals.country,
      userAgent: request.headers.get('user-agent'),
      referrer: request.headers.get('referer'),
      turnstileToken: String(form.get('cf-turnstile-response') ?? '') || null,
      source: 'web'
    });
    if (!result.ok) return fail(result.status, { error: result.error, input });
    redirect(303, `/r/${result.scanId}${result.notice ? `?notice=${encodeURIComponent(result.notice)}` : ''}`);
  }
};
