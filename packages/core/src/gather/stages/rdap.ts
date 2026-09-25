import type { RdapData } from '../../types.js';

/**
 * RDAP via the IANA bootstrap registry (https://data.iana.org/rdap/dns.json): find the
 * authoritative RDAP server for the TLD and query it directly. Free, no key. Registries
 * redact heavily, so most fields may be null — that is a legitimate result.
 */

let bootstrap: { fetchedAt: number; map: Map<string, string[]> } | null = null;

async function getBootstrap(fetchImpl: typeof fetch): Promise<Map<string, string[]>> {
  if (bootstrap && Date.now() - bootstrap.fetchedAt < 24 * 3600 * 1000) return bootstrap.map;
  const res = await fetchImpl('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`IANA bootstrap HTTP ${res.status}`);
  const j = (await res.json()) as { services: [string[], string[]][] };
  const map = new Map<string, string[]>();
  for (const [tlds, urls] of j.services) for (const t of tlds) map.set(t.toLowerCase(), urls.filter((u) => u.startsWith('https://')));
  bootstrap = { fetchedAt: Date.now(), map };
  return map;
}

export async function gatherRdap(registrable: string, fetchImpl: typeof fetch = fetch): Promise<RdapData | null> {
  const tld = registrable.split('.').slice(1).join('.');
  let servers: string[] = [];
  try {
    const map = await getBootstrap(fetchImpl);
    // try longest matching suffix first (e.g. "co.uk" is not in bootstrap; "uk" is)
    const parts = tld.split('.');
    for (let i = 0; i < parts.length && servers.length === 0; i++) servers = map.get(parts.slice(i).join('.')) ?? [];
  } catch {
    servers = [];
  }
  if (servers.length === 0) servers = ['https://rdap.org/'];

  for (const base of servers.slice(0, 2)) {
    let res: Response;
    try {
      res = await fetchImpl(`${base.replace(/\/$/, '')}/domain/${encodeURIComponent(registrable)}`, {
        headers: { accept: 'application/rdap+json, application/json' },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      continue;
    }
    if (res.status === 404) return { registrar: null, created: null, updated: null, expires: null, status: [], nameservers: [], dnssecSigned: null };
    if (!res.ok) continue;
    let j: RdapDomain;
    try {
      j = (await res.json()) as RdapDomain;
    } catch {
      continue;
    }
    const ev = (action: string) => j.events?.find((e) => e.eventAction === action)?.eventDate ?? null;
    const registrarEntity = j.entities?.find((e) => e.roles?.includes('registrar'));
    const registrar = registrarEntity ? (vcardName(registrarEntity.vcardArray) ?? registrarEntity.handle ?? null) : null;
    return {
      registrar,
      created: ev('registration'),
      updated: ev('last changed'),
      expires: ev('expiration'),
      status: j.status ?? [],
      nameservers: (j.nameservers ?? []).map((n) => n.ldhName?.toLowerCase() ?? '').filter(Boolean),
      dnssecSigned: j.secureDNS?.delegationSigned ?? null
    };
  }
  return null;
}

interface RdapDomain {
  events?: { eventAction: string; eventDate: string }[];
  entities?: { roles?: string[]; handle?: string; vcardArray?: unknown }[];
  status?: string[];
  nameservers?: { ldhName?: string }[];
  secureDNS?: { delegationSigned?: boolean };
}

function vcardName(v: unknown): string | null {
  if (!Array.isArray(v) || !Array.isArray(v[1])) return null;
  for (const item of v[1] as unknown[]) {
    if (Array.isArray(item) && item[0] === 'fn' && typeof item[3] === 'string') return item[3];
  }
  return null;
}
