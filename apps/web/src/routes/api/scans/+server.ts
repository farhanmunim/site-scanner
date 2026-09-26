import { json, type RequestHandler } from '@sveltejs/kit';
import { requestScan } from '$lib/server/scan-service.js';
import { config } from '$lib/server/config.js';

/** POST /api/scans { "url": "example.com" } → { scanId, cached, url } */
export const POST: RequestHandler = async ({ request, locals }) => {
  let body: { url?: string; turnstileToken?: string } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON: {"url": "example.com"}' }, { status: 400 });
  }
  const result = await requestScan({ input: String(body.url ?? ''), ip: locals.clientIp, country: locals.country, userAgent: request.headers.get('user-agent'), referrer: request.headers.get('referer'), turnstileToken: body.turnstileToken ?? null, source: locals.admin ? 'admin' : request.headers.get('x-scan-source') === 'web' ? 'web' : 'api' });
  if (!result.ok) return json({ error: result.error }, { status: result.status });
  return json({ scanId: result.scanId, cached: result.cached, notice: result.notice, url: `${config.publicSiteUrl}/r/${result.scanId}`, api: `${config.publicSiteUrl}/api/scans/${result.scanId}` }, { status: result.cached ? 200 : 202 });
};
