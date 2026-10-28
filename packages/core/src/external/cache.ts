import type { ExternalConfig } from './index.js';
import { quotaIdForKey, takeQuota } from './quota.js';

/**
 * Cache first, then the source's budget, then the network. A budget refusal is not cached (the next scan may
 * succeed) and looks to the caller like any other unavailable source.
 */
export async function cached<T>(cfg: ExternalConfig, key: string, ttlSec: number, fn: () => Promise<T | null>): Promise<T | null> {
  if (cfg.cache) {
    const hit = await cfg.cache.get<T>(key).catch(() => undefined);
    if (hit !== undefined) return hit;
  }
  const id = quotaIdForKey(key);
  if (id && !(await takeQuota(cfg.quota, id))) return null;
  const v = await fn().catch(() => null);
  if (cfg.cache && v !== null) await cfg.cache.set(key, v, ttlSec).catch(() => {});
  return v;
}
