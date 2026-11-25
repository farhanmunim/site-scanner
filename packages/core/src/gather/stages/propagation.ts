import { Resolver } from 'node:dns/promises';
import { dohQuery } from '../doh.js';
import type { PropagationData, PropagationResolver, PropagationRow } from '../../types.js';

/** Public recursive resolvers on different networks and continents. */
export const PROPAGATION_RESOLVERS: PropagationResolver[] = [
  { name: 'Google', ip: '8.8.8.8' },
  { name: 'Cloudflare', ip: '1.1.1.1' },
  { name: 'Quad9', ip: '9.9.9.9' },
  { name: 'OpenDNS', ip: '208.67.222.222' },
  { name: 'AdGuard', ip: '94.140.14.14' },
  { name: 'CleanBrowsing', ip: '185.228.168.9' },
  { name: 'Verisign', ip: '64.6.64.6' },
  { name: 'Comodo', ip: '8.26.56.26' }
];

const TYPES: PropagationRow['type'][] = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME'];

/** Independent view of the same record over HTTPS, used to catch networks that intercept plain DNS. */
export type ReferenceQuery = (host: string, type: PropagationRow['type']) => Promise<string[] | null>;

const defaultReference: ReferenceQuery = async (host, type) => (await dohQuery(host, type)).answers.map((a) => a.data);

export type ResolverQuery = (resolver: PropagationResolver, host: string, type: PropagationRow['type']) => Promise<string[] | null>;

export const queryResolver: ResolverQuery = async (resolver, host, type) => {
  const r = new Resolver({ timeout: 2500, tries: 1 });
  r.setServers([resolver.ip]);
  try {
    switch (type) {
      case 'A':
        return await r.resolve4(host);
      case 'AAAA':
        return await r.resolve6(host);
      case 'MX':
        return (await r.resolveMx(host)).map((m) => `${m.priority} ${m.exchange.toLowerCase()}`);
      case 'NS':
        return (await r.resolveNs(host)).map((n) => n.toLowerCase());
      case 'TXT':
        return (await r.resolveTxt(host)).map((c) => c.join(''));
      case 'CNAME':
        return await r.resolveCname(host);
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    // "no such record" is a real answer (empty); timeouts and refusals are not.
    return code === 'ENODATA' || code === 'ENOTFOUND' ? [] : null;
  }
};

/** Ask each resolver for the same records and report whether they agree. */
export async function checkPropagation(host: string, opts: { types?: PropagationRow['type'][]; resolvers?: PropagationResolver[]; query?: ResolverQuery; reference?: ReferenceQuery } = {}): Promise<PropagationData> {
  const resolvers = opts.resolvers ?? PROPAGATION_RESOLVERS;
  const query = opts.query ?? queryResolver;
  const reference = opts.reference ?? (opts.query ? null : defaultReference);
  const rows = await Promise.all(
    (opts.types ?? TYPES).map(async (type): Promise<PropagationRow> => {
      const answers = await Promise.all(resolvers.map(async (resolver) => ({ resolver, values: (await query(resolver, host, type).catch(() => null))?.slice().sort() ?? null })));
      const answered = answers.filter((a) => a.values !== null).map((a) => JSON.stringify(a.values));
      const row: PropagationRow = { type, answers, consistent: new Set(answered).size <= 1 };
      // Every resolver says "no records" but an independent lookup finds some: the plain-DNS path is being
      // intercepted or filtered, so the answers say nothing about propagation.
      if (reference && answers.every((a) => a.values !== null && a.values.length === 0)) {
        const ref = await reference(host, type).catch(() => null);
        if (ref && ref.length) {
          row.answers = answers.map((a) => ({ ...a, values: null }));
          row.consistent = true;
          row.note = 'Plain DNS to the public resolvers returned nothing, but DNS-over-HTTPS shows records. This network probably filters DNS, so propagation could not be checked for this record.';
        }
      }
      return row;
    })
  );
  return { checkedAt: new Date().toISOString(), host, rows };
}
