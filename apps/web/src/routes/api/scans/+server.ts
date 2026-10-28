import { json, type RequestHandler } from '@sveltejs/kit';
import { requestScan } from '$lib/server/scan-service.js';
import { config } from '$lib/server/config.js';
import { isScope } from '@site-scanner/core';

/** POST /api/scans { "url": "example.com", "tool"?: "email" } → { scanId, cached, url }. `tool` runs only that tool's checks. */
export const POST: RequestHandler = async ({ request, locals }) => {
  let body: { url?: string; tool?: string | null; turnstileToken?: string } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON: {"url": "example.com"}' }, { status: 400 });
  }
  if (body.tool !== undefined && body.tool !== null && !isScope(body.tool)) return json({ error: 'Unknown tool.' }, { status: 400 });
  let result: Awaited<ReturnType<typeof requestScan>>;
  try {
    result = await requestScan({ scope: body.tool ?? null, input: String(body.url ?? ''), ip: locals.clientIp, country: locals.country, userAgent: request.headers.get('user-agent'), referrer: request.headers.get('referer'), turnstileToken: body.turnstileToken ?? null, source: locals.admin ? 'admin' : request.headers.get('x-scan-source') === 'web' ? 'web' : 'api' });
  } catch (e) {
    console.error('[web] scan request failed:', e);
    return json({ error: 'The scanner hit a problem starting this scan. It has been logged; please try again in a moment.' }, { status: 500 });
  }
  if (!result.ok) return json({ error: result.error }, { status: result.status });
  return json({ scanId: result.scanId, cached: result.cached, notice: result.notice, url: `${config.publicSiteUrl}/r/${result.scanId}`, api: `${config.publicSiteUrl}/api/scans/${result.scanId}` }, { status: result.cached ? 200 : 202 });
};
