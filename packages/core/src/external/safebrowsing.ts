/** Google Safe Browsing. */
import { cached } from './cache.js';
import type { ExternalConfig } from './config.js';
import type { SafeBrowsingData } from '../types.js';

export async function fetchSafeBrowsing(url: string, cfg: ExternalConfig): Promise<SafeBrowsingData | null> {
  if (!cfg.googleApiKey || cfg.safeBrowsing === false) return null;
  return cached(cfg, `gsb:${url}`, 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    const res = await f(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${cfg.googleApiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'site-scan', clientVersion: '1.0' },
        threatInfo: { threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'], platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'], threatEntries: [{ url }] }
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { matches?: { threatType: string }[] };
    return { checkedAt: new Date().toISOString(), threats: [...new Set((j.matches ?? []).map((m) => m.threatType))] };
  });
}
