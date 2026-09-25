import type { RequestHandler } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { config } from '$lib/server/config.js';

/** Screenshots live on a volume shared with the worker; names are scan ids, so they are unguessable. */
export const GET: RequestHandler = async ({ params }) => {
  const file = params.file!;
  if (!/^[0-9a-f-]{36}\.jpg$/i.test(file)) return new Response('not found', { status: 404 });
  const path = join(config.screenshotDir, file);
  const s = await stat(path).catch(() => null);
  if (!s?.isFile()) return new Response('not found', { status: 404 });
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { 'content-type': 'image/jpeg', 'content-length': String(s.size), 'cache-control': 'private, max-age=86400', 'x-robots-tag': 'noindex' } });
};
