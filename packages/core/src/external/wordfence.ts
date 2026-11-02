/** Wordfence Intelligence vulnerability feed for WordPress components. */
import { takeQuota } from './quota.js';
import type { ExternalConfig } from './config.js';
import type { WordfenceVuln } from '../types.js';

export interface WordfenceItem {
  type: 'plugin' | 'theme' | 'core';
  slug: string;
}

const wfKey = (i: WordfenceItem) => `${i.type}:${i.slug}`;

/**
 * Wordfence Intelligence vulnerability feed (v3, free but needs an API key). Results are cached per
 * component (an empty list is a real answer: "no advisories"). Returns null when the feed is unavailable
 * (no key, download failed), which callers must not read as "clean".
 */
export async function fetchWordfence(items: WordfenceItem[], cfg: ExternalConfig): Promise<Record<string, WordfenceVuln[]> | null> {
  const out: Record<string, WordfenceVuln[]> = {};
  if (cfg.wordpress === false || !cfg.wordfenceApiKey || items.length === 0) return null;
  const missing: WordfenceItem[] = [];
  for (const i of items) {
    const hit = cfg.cache ? await cfg.cache.get<WordfenceVuln[]>(`wordfence3:${wfKey(i)}`).catch(() => undefined) : undefined;
    if (hit) out[wfKey(i)] = hit;
    else missing.push(i);
  }
  if (!missing.length) return out;
  const index = await wordfenceIndex(cfg);
  // Partial results would read as "no advisories" for the rest, so report unavailable instead.
  if (!index) return null;
  for (const i of missing) {
    const list = index.get(wfKey(i)) ?? [];
    out[wfKey(i)] = list;
    if (cfg.cache) await cfg.cache.set(`wordfence3:${wfKey(i)}`, list, 24 * 3600).catch(() => {});
  }
  return out;
}

let wordfenceMemo: { at: number; key: string; pending: Promise<Map<string, WordfenceVuln[]> | null> } | null = null;
/** After a failed or rate-limited download nothing may retry until this time (per process; also shared through the cache). */
let wordfenceFailedUntil = 0;
const WF_COOLDOWN_KEY = 'wordfence3:cooldown';
const WF_FEED_TTL_MS = 12 * 3600_000;

/** Test hook. */
export function resetWordfenceMemo(): void {
  wordfenceMemo = null;
  wordfenceFailedUntil = 0;
}

async function wordfenceCooldown(cfg: ExternalConfig, seconds: number): Promise<void> {
  wordfenceFailedUntil = Date.now() + seconds * 1000;
  // Shared with every other worker (and survives a restart): a crash-looping worker must not re-download either.
  if (cfg.cache) await cfg.cache.set(WF_COOLDOWN_KEY, true, seconds).catch(() => {});
}

/**
 * The production feed is one JSON document of ~150 MB, so it is parsed at most once per 12 hours per process (shared
 * by concurrent scans) and compacted to just what matching needs. A failed or rate-limited download starts a cooldown
 * instead of being retried by the next scan: Wordfence rate-limits this endpoint and suspends keys that keep asking.
 */
async function wordfenceIndex(cfg: ExternalConfig): Promise<Map<string, WordfenceVuln[]> | null> {
  const key = cfg.wordfenceApiKey!;
  if (wordfenceMemo && wordfenceMemo.key === key && Date.now() - wordfenceMemo.at < WF_FEED_TTL_MS) return wordfenceMemo.pending;
  if (Date.now() < wordfenceFailedUntil) return null;
  if (cfg.cache && (await cfg.cache.get<boolean>(WF_COOLDOWN_KEY).catch(() => undefined))) return null;
  if (!(await takeQuota(cfg.quota, 'wordfence'))) return null;
  const f = cfg.fetchImpl ?? fetch;
  const pending = (async () => {
    try {
      const res = await f('https://www.wordfence.com/api/intelligence/v3/vulnerabilities/production', { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(180_000) });
      if (!res.ok) {
        const retryAfter = Number(res.headers.get('retry-after'));
        // 429: honour Retry-After (at most 6 h), else an hour. Anything else: half an hour.
        await wordfenceCooldown(cfg, res.status === 429 ? Math.min(6 * 3600, Math.max(600, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 3600)) : 1800);
        return null;
      }
      const j = (await res.json()) as Record<string, WordfenceRecord> | null;
      if (!j) throw new Error('empty feed');
      const idx = new Map<string, WordfenceVuln[]>();
      for (const v of Object.values(j)) {
        for (const sw of v.software ?? []) {
          if (!sw.slug || (sw.type !== 'plugin' && sw.type !== 'theme' && sw.type !== 'core')) continue;
          const k = `${sw.type}:${sw.slug}`;
          const list = idx.get(k) ?? [];
          list.push({
            title: v.title ?? 'Untitled advisory',
            cve: v.cve ?? null,
            cvss: typeof v.cvss?.score === 'number' ? v.cvss.score : null,
            ranges: Object.values(sw.affected_versions ?? {}).map((r) => ({ from: r.from_version && r.from_version !== '*' ? r.from_version : null, fromInclusive: r.from_inclusive !== false, to: r.to_version && r.to_version !== '*' ? r.to_version : null, toInclusive: r.to_inclusive !== false })),
            patched: sw.patched_versions ?? [],
            patchedFlag: !!sw.patched
          });
          idx.set(k, list);
        }
      }
      return idx;
    } catch {
      await wordfenceCooldown(cfg, 1800);
      return null;
    }
  })();
  wordfenceMemo = { at: Date.now(), key, pending };
  // Only a successful index stays memoised; a failed one has set a cooldown above.
  void pending.then((r) => {
    if (!r && wordfenceMemo?.pending === pending) wordfenceMemo = null;
  });
  return pending;
}

interface WordfenceRecord {
  title?: string;
  cve?: string | null;
  cvss?: { score?: number };
  software?: { type?: string; slug?: string; patched?: boolean; patched_versions?: string[]; affected_versions?: Record<string, { from_version?: string; from_inclusive?: boolean; to_version?: string; to_inclusive?: boolean }> }[];
}
