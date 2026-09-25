/**
 * DNS over HTTPS (JSON API) — works identically in Workers, browsers and Node.
 * Cloudflare 1.1.1.1 is the default; Google 8.8.8.8 is the fallback.
 */

export type RRType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'CAA' | 'SOA' | 'PTR';

const TYPE_IDS: Record<RRType, number> = { A: 1, AAAA: 28, CNAME: 5, MX: 15, NS: 2, TXT: 16, CAA: 257, SOA: 6, PTR: 12 };

export interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

export interface DohResult {
  status: number;
  ad: boolean;
  answers: DohAnswer[];
}

const RESOLVERS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve'];

export async function dohQuery(name: string, type: RRType, fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Promise<DohResult> {
  let lastErr: unknown;
  for (const base of RESOLVERS) {
    try {
      const u = new URL(base);
      u.searchParams.set('name', name);
      u.searchParams.set('type', type);
      const res = await fetchImpl(u.toString(), {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) throw new Error(`DoH ${res.status}`);
      const j = (await res.json()) as { Status: number; AD?: boolean; Answer?: DohAnswer[] };
      const wanted = TYPE_IDS[type];
      return {
        status: j.Status,
        ad: !!j.AD,
        answers: (j.Answer ?? []).filter((a) => a.type === wanted)
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('DoH failed');
}

/** Strip quotes from a TXT rdata as returned by DoH JSON ("\"v=spf1 ...\""). */
export function cleanTxt(data: string): string {
  return data
    .split(/"\s+"/)
    .map((s) => s.replace(/^"|"$/g, ''))
    .join('')
    .replace(/\\"/g, '"');
}

/** Resolve A + AAAA, following CNAMEs implicitly (the resolver does that for us). */
export async function resolveAddresses(host: string, fetchImpl?: typeof fetch): Promise<{ v4: string[]; v6: string[]; ad: boolean }> {
  const [a, aaaa] = await Promise.all([dohQuery(host, 'A', fetchImpl), dohQuery(host, 'AAAA', fetchImpl).catch(() => ({ answers: [], ad: false, status: 2 }))]);
  return { v4: a.answers.map((x) => x.data), v6: aaaa.answers.map((x) => x.data), ad: a.ad };
}
