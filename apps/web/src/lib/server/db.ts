import { createDb, type Db } from '@site-scanner/db';
import { config } from './config.js';

let instance: { db: Db; client: ReturnType<typeof createDb>['client'] } | null = null;

export function getDb(): Db {
  if (!instance) instance = createDb(config.databaseUrl, { max: 8 });
  return instance.db;
}
