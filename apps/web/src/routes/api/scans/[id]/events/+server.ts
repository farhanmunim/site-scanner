import type { RequestHandler } from '@sveltejs/kit';
import { eq, scans } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';
import { withScores } from '$lib/server/report-compat.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server-sent events: pushes {status, stages, report} whenever they change, until the scan finishes. ?lite=1 omits the report. */
export const GET: RequestHandler = async ({ params, url }) => {
  if (!UUID.test(params.id!)) return new Response('not found', { status: 404 });
  const id = params.id!;
  const lite = url.searchParams.get('lite') === '1';
  const db = getDb();
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      let last = '';
      let ticks = 0;
      const tick = async () => {
        try {
          const [row] = await db.select({ status: scans.status, stages: scans.stages, report: scans.report, error: scans.error }).from(scans).where(eq(scans.id, id)).limit(1);
          if (!row) {
            controller.enqueue(encoder.encode('event: gone\ndata: {}\n\n'));
            return close();
          }
          const payload = JSON.stringify(lite ? { status: row.status, stages: row.stages, error: row.error } : withScores(row));
          if (payload !== last) {
            last = payload;
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          } else if (ticks % 15 === 0) controller.enqueue(encoder.encode(': keepalive\n\n'));
          if (!['queued', 'running'].includes(row.status) || ++ticks > 240) return close();
        } catch {
          close();
        }
      };
      const close = () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      void tick();
      timer = setInterval(tick, 1000);
    },
    cancel() {
      clearInterval(timer);
    }
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' } });
};
