import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

/** The web build bundles this package, so `import.meta.url` no longer points at the source tree: look in the usual places. */
function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.MIGRATIONS_DIR, join(here, '..', 'drizzle'), resolve(process.cwd(), 'packages/db/drizzle'), resolve(process.cwd(), '../../packages/db/drizzle'), '/app/packages/db/drizzle'].filter((c): c is string => !!c);
  const found = candidates.find((c) => existsSync(join(c, 'meta', '_journal.json')));
  if (!found) throw new Error(`Migrations folder not found (looked in ${candidates.join(', ')})`);
  return found;
}

const MIGRATION_LOCK = 727_274_001;

/**
 * Apply pending migrations from packages/db/drizzle. Safe to run from several processes at once:
 * a session-level advisory lock on a dedicated connection serialises them, and the second runner
 * finds nothing left to apply.
 */
export async function runMigrations(url = process.env.DATABASE_URL): Promise<void> {
  if (!url) throw new Error('DATABASE_URL is not set');
  const lockConn = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const migConn = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await lockConn`select pg_advisory_lock(${MIGRATION_LOCK})`;
    await migrate(drizzle(migConn), { migrationsFolder: migrationsFolder() });
  } finally {
    await lockConn`select pg_advisory_unlock(${MIGRATION_LOCK})`.catch(() => {});
    await Promise.all([lockConn.end({ timeout: 5 }), migConn.end({ timeout: 5 })]);
  }
}

export const SETTINGS_KEYS = {
  scanningPaused: 'scanning_paused',
  maxScansPerDomainPerHour: 'max_scans_per_domain_per_hour',
  maxScansPerIpPerHour: 'max_scans_per_ip_per_hour',
  maxScansPerDay: 'max_scans_per_day',
  cacheWindowMinutes: 'cache_window_minutes',
  browserEnabled: 'browser_enabled',
  externalEnabled: 'external_enabled'
} as const;
