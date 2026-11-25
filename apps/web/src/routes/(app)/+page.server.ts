import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requestScan } from '$lib/server/scan-service.js';
import { isScope } from '@site-scanner/core';

/** `/?url=example.com` prefills the form; `go=1` starts the scan straight away (the nav search box); `tool` keeps a tool's focused view. */
export const load: PageServerLoad = ({ url }) => ({
  prefill: url.searchParams.get('url')?.slice(0, 2048) ?? '',
  autostart: url.searchParams.get('go') === '1',
  tool: isScope(url.searchParams.get('tool')) ? url.searchParams.get('tool') : null
});

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const form = await request.formData();
    const input = String(form.get('url') ?? '').trim();
    if (!input) return fail(400, { error: 'Enter a website address.', input });
    let result: Awaited<ReturnType<typeof requestScan>>;
    try {
      result = await requestScan({
        input,
        ip: locals.clientIp,
        country: locals.country,
        userAgent: request.headers.get('user-agent'),
        referrer: request.headers.get('referer'),
        turnstileToken: String(form.get('cf-turnstile-response') ?? '') || null,
        source: 'web',
        scope: String(form.get('tool') ?? '') || null
      });
    } catch (e) {
      console.error('[web] scan request failed:', e);
      return fail(500, { error: 'The scanner hit a problem starting this scan. It has been logged; please try again in a moment.', input });
    }
    if (!result.ok) return fail(result.status, { error: result.error, input });
    redirect(303, `/r/${result.scanId}${result.notice ? `?notice=${encodeURIComponent(result.notice)}` : ''}`);
  }
};
