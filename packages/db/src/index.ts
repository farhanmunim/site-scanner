import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export * from './schema.js';
export { sql, eq, and, or, desc, asc, gt, gte, lt, lte, count, isNull, isNotNull, inArray, like, ilike } from 'drizzle-orm';

export type Db = PostgresJsDatabase<typeof schema>;

export function createDb(url = process.env.DATABASE_URL, opts: { max?: number } = {}): { db: Db; client: ReturnType<typeof postgres> } {
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: opts.max ?? 5, prepare: false, onnotice: () => {} });
  return { db: drizzle(client, { schema }), client };
}

/** Apply pending migrations from packages/db/drizzle. Safe to run concurrently (advisory lock). */
export async function runMigrations(db: Db): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  await migrate(db, { migrationsFolder: join(here, '..', 'drizzle') });
}

export const SETTINGS_KEYS = {
  scanningPaused: 'scanning_paused',
  maxScansPerDomainPerHour: 'max_scans_per_domain_per_hour',
  maxScansPerIpPerHour: 'max_scans_per_ip_per_hour',
  cacheWindowMinutes: 'cache_window_minutes',
  browserEnabled: 'browser_enabled',
  externalEnabled: 'external_enabled'
} as const;
