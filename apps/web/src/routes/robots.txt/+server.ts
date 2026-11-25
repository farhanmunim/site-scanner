import type { RequestHandler } from '@sveltejs/kit';
import { config } from '$lib/server/config.js';

export const GET: RequestHandler = () =>
  new Response(
    ['User-agent: *', 'Allow: /$', 'Allow: /tools', 'Allow: /bot', 'Allow: /privacy', 'Disallow: /r/', 'Disallow: /archive/', 'Disallow: /api/', 'Disallow: /admin', 'Disallow: /screenshots/', '', `Sitemap: ${config.publicSiteUrl}/sitemap.xml`, ''].join('\n'),
    { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } }
  );
