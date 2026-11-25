/** Small public lookups: Wayback Machine first-seen date and Green Web Foundation hosting. */
import { cached } from './cache.js';
import { getWithRetry } from './http.js';
import type { ExternalConfig } from './config.js';

export async function fetchWayback(host: string, cfg: ExternalConfig): Promise<{ firstSeen: string | null } | null> {
  if (cfg.wayback === false) return null;
  return cached(cfg, `wayback:${host}`, 7 * 24 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    // The CDX index is slow and occasionally resets connections: allow longer and retry once.
    const res = await getWithRetry(f, `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(host)}&limit=1&fl=timestamp&filter=statuscode:200`, 20_000, 2);
    if (!res) return null;
    const t = (await res.text()).trim().split('\n')[0];
    if (!t || !/^\d{8}/.test(t)) return { firstSeen: null };
    return { firstSeen: `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` };
  });
}

export async function fetchGreenWeb(host: string, cfg: ExternalConfig): Promise<{ green: boolean; hostedBy: string | null } | null> {
  if (cfg.greenWeb === false) return null;
  return cached(cfg, `green:${host}`, 7 * 24 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    const res = await f(`https://api.thegreenwebfoundation.org/api/v3/greencheck/${encodeURIComponent(host)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { green?: boolean; hosted_by?: string };
    return { green: !!j.green, hostedBy: j.hosted_by ?? null };
  });
}
