/** WordPress.org: plugin, theme and core release data. */
import { cached } from './cache.js';
import type { ExternalConfig } from './config.js';
import type { ExternalData } from '../types.js';

export async function fetchWordPressOrg(slugs: string[], cfg: ExternalConfig): Promise<NonNullable<ExternalData['wordpressOrg']>> {
  const out: NonNullable<ExternalData['wordpressOrg']> = {};
  if (cfg.wordpress === false) return out;
  const f = cfg.fetchImpl ?? fetch;
  await Promise.all(
    slugs.slice(0, 12).map(async (slug) => {
      const v = await cached(cfg, `wporg:${slug}`, 24 * 3600, async () => {
        const res = await f(`https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=${encodeURIComponent(slug)}&request[fields][sections]=0&request[fields][description]=0&request[fields][banners]=0&request[fields][screenshots]=0`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const j = (await res.json()) as { name?: string; version?: string; last_updated?: string; active_installs?: number; tested?: string; error?: string };
        if (j.error || !j.name) return { name: slug, version: null, lastUpdated: null, activeInstalls: null, tested: null, notInDirectory: true };
        return { name: j.name.replace(/&#8211;/g, '–').replace(/&amp;/g, '&'), version: j.version ?? null, lastUpdated: j.last_updated ? normaliseWpDate(j.last_updated) : null, activeInstalls: j.active_installs ?? null, tested: j.tested ?? null };
      });
      if (v && !(v as { notInDirectory?: boolean }).notInDirectory) out[slug] = v;
    })
  );
  return out;
}

function normaliseWpDate(s: string): string | null {
  // "2025-08-11 3:04pm GMT"
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1]! : null;
}

/** Latest stable WordPress release. */
export async function fetchWordPressLatest(cfg: ExternalConfig): Promise<string | null> {
  if (cfg.wordpress === false) return null;
  return cached(cfg, 'wp-latest', 6 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    const res = await f('https://api.wordpress.org/core/version-check/1.7/', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { offers?: { response?: string; version?: string }[] };
    return j.offers?.find((o) => o.response === 'upgrade' || !o.response)?.version ?? j.offers?.[0]?.version ?? null;
  });
}

export async function fetchWordPressThemes(slugs: string[], cfg: ExternalConfig): Promise<NonNullable<ExternalData['wordpressThemes']>> {
  const out: NonNullable<ExternalData['wordpressThemes']> = {};
  if (cfg.wordpress === false) return out;
  const f = cfg.fetchImpl ?? fetch;
  await Promise.all(
    slugs.slice(0, 3).map(async (slug) => {
      const v = await cached(cfg, `wptheme:${slug}`, 24 * 3600, async () => {
        const res = await f(`https://api.wordpress.org/themes/info/1.2/?action=theme_information&request[slug]=${encodeURIComponent(slug)}&request[fields][sections]=0`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const j = (await res.json()) as { name?: string; version?: string; last_updated?: string; error?: string };
        if (j.error || !j.name) return null;
        return { name: j.name, version: j.version ?? null, lastUpdated: j.last_updated ? normaliseWpDate(j.last_updated) : null };
      });
      if (v) out[slug] = v;
    })
  );
  return out;
}
