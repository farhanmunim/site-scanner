import { Resolver } from 'node:dns/promises';
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
export async function checkPropagation(host: string, opts: { types?: PropagationRow['type'][]; resolvers?: PropagationResolver[]; query?: ResolverQuery } = {}): Promise<PropagationData> {
  const resolvers = opts.resolvers ?? PROPAGATION_RESOLVERS;
  const query = opts.query ?? queryResolver;
  const rows = await Promise.all(
    (opts.types ?? TYPES).map(async (type): Promise<PropagationRow> => {
      const answers = await Promise.all(resolvers.map(async (resolver) => ({ resolver, values: (await query(resolver, host, type).catch(() => null))?.slice().sort() ?? null })));
      const answered = answers.filter((a) => a.values !== null).map((a) => JSON.stringify(a.values));
      return { type, answers, consistent: new Set(answered).size <= 1 };
    })
  );
  return { checkedAt: new Date().toISOString(), host, rows };
}
