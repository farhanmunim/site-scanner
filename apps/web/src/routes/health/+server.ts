import { json, type RequestHandler } from '@sveltejs/kit';
import { sql } from '@site-scanner/db';
import { getDb } from '$lib/server/db.js';
import { getRedis } from '$lib/server/redis.js';

export const GET: RequestHandler = async () => {
  const checks: Record<string, 'ok' | 'fail'> = { db: 'fail', redis: 'fail' };
  try {
    await getDb().execute(sql`select 1`);
    checks.db = 'ok';
  } catch {
    /* reported below */
  }
  try {
    if ((await getRedis().ping()) === 'PONG') checks.redis = 'ok';
  } catch {
    /* reported below */
  }
  const ok = Object.values(checks).every((v) => v === 'ok');
  return json({ status: ok ? 'ok' : 'degraded', checks }, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
};
