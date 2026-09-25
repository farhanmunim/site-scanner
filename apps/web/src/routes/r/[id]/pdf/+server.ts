import type { RequestHandler } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { eq, scans } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';
import { getPdfQueue } from '$lib/server/redis.js';
import { config } from '$lib/server/config.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /r/:id/pdf — serves the PDF if the worker has rendered it, otherwise queues the render
 * and returns a small auto-refreshing page. The PDF is the same report page in print mode.
 */
export const GET: RequestHandler = async ({ params }) => {
  const id = params.id!;
  if (!UUID.test(id)) return new Response('not found', { status: 404 });
  const [row] = await getDb().select({ id: scans.id, status: scans.status, host: scans.displayHost, finishedAt: scans.finishedAt }).from(scans).where(eq(scans.id, id)).limit(1);
  if (!row) return new Response('not found', { status: 404 });
  if (['queued', 'running'].includes(row.status)) return new Response('The scan is still running; try again when it finishes.', { status: 409 });

  const path = join(config.pdfDir, `${id}.pdf`);
  const s = await stat(path).catch(() => null);
  if (s?.isFile() && s.size > 0) {
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      headers: { 'content-type': 'application/pdf', 'content-length': String(s.size), 'content-disposition': `attachment; filename="site-scan-${row.host.replace(/[^a-z0-9.-]/gi, '_')}.pdf"`, 'cache-control': 'private, max-age=3600', 'x-robots-tag': 'noindex' }
    });
  }
  try {
    await getPdfQueue().add('pdf', { scanId: id }, { jobId: `pdf-${id}` });
  } catch {
    return new Response('PDF export is temporarily unavailable.', { status: 503 });
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Preparing PDF…</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;color:#1c2128;text-align:center}p{color:#6b7280}</style></head>
<body><h1>Preparing your PDF…</h1><p>This usually takes 5–15 seconds. The download starts automatically; if not, <a href="">refresh</a>.</p><p><a href="/r/${id}">Back to the report</a></p></body></html>`;
  return new Response(html, { status: 202, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
};
