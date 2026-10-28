import type { RequestHandler } from '@sveltejs/kit';
import { config } from '$lib/server/config.js';
import { TOOLS } from '$lib/ui/tools';

/** Only the public, indexable pages. Reports (/r/…) are private by link and never listed. */
export const GET: RequestHandler = () => {
  const paths = ['/', '/tools', ...TOOLS.map((t) => `/tools/${t.slug}`), '/bot', '/privacy'];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${config.publicSiteUrl}${p === '/' ? '/' : p}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
