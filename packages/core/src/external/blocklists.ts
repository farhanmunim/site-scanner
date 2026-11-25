/** DNS blocklists for the site's web and mail addresses. */
import { dohQuery } from '../gather/doh.js';
import type { ExternalConfig } from './config.js';
import type { BlocklistData, BlocklistHit, DnsRecords, IpInfo } from '../types.js';

const BLOCKLISTS = ['zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org', 'psbl.surriel.com', 'dnsbl-1.uceprotect.net', 'dnsbl.dronebl.org', 'all.s5h.net'];
const CDN_ASN = /cloudflare|fastly|akamai|cloudfront|incapsula|imperva|sucuri|stackpath/i;

/** Reverse an IPv4 address for DNSBL lookups; null for anything else. */
export function dnsblName(ip: string, zone: string): string | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  return m ? `${m[4]}.${m[3]}.${m[2]}.${m[1]}.${zone}` : null;
}

/**
 * Check the site's own IPs (skipped behind a CDN) and its mail servers against public DNS blocklists.
 * Several lists refuse queries from big public resolvers (127.255.255.x): those count as unavailable,
 * never as "clean".
 */
export async function fetchBlocklists(dns: DnsRecords | null, ips: IpInfo[], cfg: ExternalConfig, query: (name: string) => Promise<{ status: number; answers: string[] } | null> = defaultDnsblQuery): Promise<BlocklistData | null> {
  if (cfg.blocklists === false || !dns) return null;
  const subjects = new Map<string, 'web' | 'mail'>();
  for (const ip of ips) if (ip.version === 4 && !CDN_ASN.test(ip.asnOrg ?? '')) subjects.set(ip.ip, 'web');
  const mxHosts = dns.MX.slice(0, 3).map((m) => m.exchange).filter(Boolean);
  const mxIps = await Promise.all(mxHosts.map((h) => dohQuery(h, 'A').then((r) => r.answers.map((a) => a.data)).catch(() => [] as string[])));
  for (const ip of mxIps.flat().slice(0, 6)) subjects.set(ip, 'mail');
  const checked = [...subjects].slice(0, 8).map(([ip, role]) => ({ ip, role }));
  if (!checked.length) return { checkedAt: new Date().toISOString(), checked, lists: BLOCKLISTS, listed: [], unavailable: [] };
  const listed: BlocklistHit[] = [];
  const unavailable = new Set<string>();
  await Promise.all(
    checked.flatMap(({ ip, role }) =>
      BLOCKLISTS.map(async (zone) => {
        const name = dnsblName(ip, zone);
        if (!name) return;
        const r = await query(name).catch(() => null);
        if (!r || (r.status !== 0 && r.status !== 3)) return void unavailable.add(zone);
        const code = r.answers.find((a) => a.startsWith('127.'));
        if (!code) return;
        if (code.startsWith('127.255.255.')) return void unavailable.add(zone);
        listed.push({ list: zone, subject: ip, role, code });
      })
    )
  );
  return { checkedAt: new Date().toISOString(), checked, lists: BLOCKLISTS, listed, unavailable: [...unavailable] };
}

async function defaultDnsblQuery(name: string): Promise<{ status: number; answers: string[] } | null> {
  const r = await dohQuery(name, 'A');
  return { status: r.status, answers: r.answers.map((a) => a.data) };
}
