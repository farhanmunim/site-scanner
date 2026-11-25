import { json, type RequestHandler } from '@sveltejs/kit';
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
 * GET /r/:id/pdf
 *  - Accept: application/json → { status: 'pending' | 'ready' | 'unavailable' } (queues the render on first call)
 *  - otherwise → the PDF as an attachment once ready, or a tiny auto-refreshing page (no-JS fallback)
 */
export const GET: RequestHandler = async ({ params, request }) => {
  const id = params.id!;
  if (!UUID.test(id)) return new Response('not found', { status: 404 });
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const [row] = await getDb().select({ id: scans.id, status: scans.status, host: scans.displayHost }).from(scans).where(eq(scans.id, id)).limit(1);
  if (!row) return wantsJson ? json({ status: 'unavailable', error: 'Not found' }, { status: 404 }) : new Response('not found', { status: 404 });
  if (['queued', 'running'].includes(row.status)) {
    const msg = 'The scan is still running; try again when it finishes.';
    return wantsJson ? json({ status: 'unavailable', error: msg }, { status: 409 }) : new Response(msg, { status: 409 });
  }

  const path = join(config.pdfDir, `${id}.pdf`);
  const s = await stat(path).catch(() => null);
  const ready = !!s?.isFile() && s.size > 0;

  if (ready && !wantsJson) {
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      headers: { 'content-type': 'application/pdf', 'content-length': String(s!.size), 'content-disposition': `attachment; filename="site-scan-${row.host.replace(/[^a-z0-9.-]/gi, '_')}.pdf"`, 'cache-control': 'private, max-age=3600', 'x-robots-tag': 'noindex' }
    });
  }
  if (!ready) {
    try {
      const q = getPdfQueue();
      // A fixed job id makes BullMQ ignore add() while the old job is still stored, so a failed render could never be retried.
      const old = await q.getJob(`pdf-${id}`);
      if (old && ((await old.isFailed()) || (await old.isCompleted()))) await old.remove().catch(() => {});
      await q.add('pdf', { scanId: id }, { jobId: `pdf-${id}` });
    } catch {
      const msg = 'PDF export is temporarily unavailable.';
      return wantsJson ? json({ status: 'unavailable', error: msg }, { status: 503 }) : new Response(msg, { status: 503 });
    }
  }
  if (wantsJson) return json({ status: ready ? 'ready' : 'pending' }, { headers: { 'cache-control': 'no-store' } });

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Preparing PDF…</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;color:#16171a;text-align:center}p{color:#7d7e85}</style></head>
<body><h1>Preparing your PDF…</h1><p>This usually takes 5–15 seconds. The download starts automatically; if not, <a href="">refresh</a>.</p><p><a href="/r/${id}">Back to the report</a></p></body></html>`;
  return new Response(html, { status: 202, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
};
