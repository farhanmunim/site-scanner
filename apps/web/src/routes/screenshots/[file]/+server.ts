import type { RequestHandler } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { config } from '$lib/server/config.js';

/** Screenshots live on a volume shared with the worker; names are scan ids, so they are unguessable. */
export const GET: RequestHandler = async ({ params }) => {
  const file = params.file!;
  // `<scan id>.jpg` is the page screenshot; `<scan id>-og.<ext>` is the site's own share image (raster types only, never SVG).
  const m = /^[0-9a-f-]{36}(-og)?\.(jpg|png|webp|gif)$/i.exec(file);
  if (!m || (!m[1] && m[2] !== 'jpg')) return new Response('not found', { status: 404 });
  const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[m[2]!.toLowerCase() as 'jpg'];
  const path = join(config.screenshotDir, file);
  const s = await stat(path).catch(() => null);
  if (!s?.isFile()) return new Response('not found', { status: 404 });
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { 'content-type': type, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self' data:", 'content-length': String(s.size), 'cache-control': 'private, max-age=86400', 'x-robots-tag': 'noindex' } });
};
