import type { IpInfo, ReputationData } from '../types.js';
import type { ExternalConfig } from './index.js';
import { cached } from './cache.js';

/**
 * Threat-intelligence lookups: VirusTotal, AbuseIPDB, AlienVault OTX and URLhaus. Each is optional and needs
 * its own free key. We only send the domain or IP (public facts about the target), never page content.
 * Free tiers are small (VirusTotal: 4 requests a minute), so every answer is cached and a 429 pauses that source.
 */

const CDN_ASN = /cloudflare|fastly|akamai|cloudfront|incapsula|imperva|sucuri|stackpath/i;

/** After a 429 stop asking this source for a while, across scans and workers (shared cache). */
async function paused(cfg: ExternalConfig, id: string): Promise<boolean> {
  return !!cfg.cache && (await cfg.cache.get<boolean>(`rep:${id}:cooldown`).catch(() => undefined)) === true;
}
async function pause(cfg: ExternalConfig, id: string, seconds = 300): Promise<null> {
  await cfg.cache?.set(`rep:${id}:cooldown`, true, seconds).catch(() => {});
  return null;
}

export async function fetchVirusTotal(domain: string, cfg: ExternalConfig): Promise<ReputationData['virustotal']> {
  if (!cfg.virustotalKey || (await paused(cfg, 'vt'))) return null;
  const f = cfg.fetchImpl ?? fetch;
  return cached(cfg, `rep:vt:${domain}`, 24 * 3600, async () => {
    const res = await f(`https://www.virustotal.com/api/v3/domains/${encodeURIComponent(domain)}`, { headers: { 'x-apikey': cfg.virustotalKey!, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 429) return pause(cfg, 'vt');
    if (!res.ok) return null;
    const a = ((await res.json()) as { data?: { attributes?: { last_analysis_stats?: Record<string, number>; reputation?: number; categories?: Record<string, string> } } }).data?.attributes;
    const s = a?.last_analysis_stats;
    if (!s) return null;
    const n = (k: string) => (typeof s[k] === 'number' ? s[k]! : 0);
    return { malicious: n('malicious'), suspicious: n('suspicious'), harmless: n('harmless'), undetected: n('undetected'), engines: n('malicious') + n('suspicious') + n('harmless') + n('undetected'), reputation: typeof a?.reputation === 'number' ? a.reputation : null, categories: [...new Set(Object.values(a?.categories ?? {}))].slice(0, 6) };
  });
}

export async function fetchAbuseIpdb(ips: IpInfo[], cfg: ExternalConfig): Promise<NonNullable<ReputationData['abuseipdb']> | null> {
  if (!cfg.abuseipdbKey || (await paused(cfg, 'abuseipdb'))) return null;
  // A CDN's address says nothing about the site's own server.
  const own = ips.filter((i) => !CDN_ASN.test(i.asnOrg ?? '')).slice(0, 2);
  if (!own.length) return [];
  const f = cfg.fetchImpl ?? fetch;
  const rows = await Promise.all(
    own.map((i) =>
      cached(cfg, `rep:abuse:${i.ip}`, 12 * 3600, async () => {
        const res = await f(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(i.ip)}&maxAgeInDays=90`, { headers: { Key: cfg.abuseipdbKey!, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
        if (res.status === 429) return pause(cfg, 'abuseipdb', 900);
        if (!res.ok) return null;
        const d = ((await res.json()) as { data?: { abuseConfidenceScore?: number; totalReports?: number; lastReportedAt?: string | null; usageType?: string | null; isp?: string | null } }).data;
        if (!d || typeof d.abuseConfidenceScore !== 'number') return null;
        return { ip: i.ip, score: d.abuseConfidenceScore, reports: d.totalReports ?? 0, lastReportedAt: d.lastReportedAt ?? null, usageType: d.usageType ?? null, isp: d.isp ?? null };
      })
    )
  );
  const ok = rows.filter((r): r is NonNullable<typeof r> => !!r);
  return ok.length ? ok : null;
}

export async function fetchOtx(domain: string, cfg: ExternalConfig): Promise<NonNullable<ReputationData['otx']> | null> {
  if (!cfg.otxKey || (await paused(cfg, 'otx'))) return null;
  const f = cfg.fetchImpl ?? fetch;
  return cached(cfg, `rep:otx:${domain}`, 24 * 3600, async () => {
    const res = await f(`https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/general`, { headers: { 'X-OTX-API-KEY': cfg.otxKey!, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 429) return pause(cfg, 'otx');
    if (res.status === 404) return { pulses: 0, names: [] };
    if (!res.ok) return null;
    const p = ((await res.json()) as { pulse_info?: { count?: number; pulses?: { name?: string }[] } }).pulse_info;
    return { pulses: p?.count ?? 0, names: (p?.pulses ?? []).map((x) => x.name ?? '').filter(Boolean).slice(0, 5).map((n) => n.slice(0, 120)) };
  });
}

export async function fetchUrlhaus(domain: string, cfg: ExternalConfig): Promise<NonNullable<ReputationData['urlhaus']> | null> {
  if (!cfg.urlhausKey || (await paused(cfg, 'urlhaus'))) return null;
  const f = cfg.fetchImpl ?? fetch;
  return cached(cfg, `rep:urlhaus:${domain}`, 6 * 3600, async () => {
    const res = await f('https://urlhaus-api.abuse.ch/v1/host/', { method: 'POST', headers: { 'Auth-Key': cfg.urlhausKey!, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ host: domain }).toString(), signal: AbortSignal.timeout(10_000) });
    if (res.status === 429) return pause(cfg, 'urlhaus');
    if (!res.ok) return null;
    const j = (await res.json()) as { query_status?: string; urls_online?: number | string; url_count?: number | string; blacklists?: Record<string, string> };
    if (j.query_status === 'no_results') return { listed: false, urlsOnline: 0, urlCount: 0, blacklists: [] };
    if (j.query_status !== 'ok') return null;
    return { listed: true, urlsOnline: Number(j.urls_online) || 0, urlCount: Number(j.url_count) || 0, blacklists: Object.entries(j.blacklists ?? {}).filter(([, v]) => v && v !== 'not listed').map(([k, v]) => `${k}: ${v}`) };
  });
}

/** Ask every configured source in parallel. null when no source has a key (nothing to report). */
export async function fetchReputation(registrableDomain: string, ips: IpInfo[], cfg: ExternalConfig): Promise<ReputationData | null> {
  if (cfg.reputation === false) return null;
  const asked: ReputationData['asked'] = [];
  if (cfg.virustotalKey) asked.push('virustotal');
  if (cfg.abuseipdbKey) asked.push('abuseipdb');
  if (cfg.otxKey) asked.push('otx');
  if (cfg.urlhausKey) asked.push('urlhaus');
  if (!asked.length) return null;
  const v4 = ips.filter((i) => i.version === 4);
  const [virustotal, abuseipdb, otx, urlhaus] = await Promise.all([
    cfg.virustotalKey ? fetchVirusTotal(registrableDomain, cfg) : null,
    cfg.abuseipdbKey ? fetchAbuseIpdb(v4.length ? v4 : ips, cfg) : null,
    cfg.otxKey ? fetchOtx(registrableDomain, cfg) : null,
    cfg.urlhausKey ? fetchUrlhaus(registrableDomain, cfg) : null
  ]);
  return { checkedAt: new Date().toISOString(), virustotal, abuseipdb, otx, urlhaus, asked };
}
