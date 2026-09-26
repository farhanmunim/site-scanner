import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import { lookup as dnsLookup } from 'node:dns';
import { checkIp } from './ip.js';

/**
 * An undici Agent whose connections are only ever opened to addresses that pass the
 * SSRF guard. Because the check happens on the address the socket actually connects to,
 * DNS rebinding (a hostname that answers public first, private second) is defeated.
 */
export function createSafeDispatcher(opts: { blockedIps?: ReadonlySet<string>; timeoutMs?: number } = {}): Dispatcher {
  return new Agent({
    connect: {
      timeout: opts.timeoutMs ?? 10_000,
      // Certificate validity is assessed by the TLS stage and reported as a finding. The
      // page fetch must still work behind an incomplete chain or an expired certificate.
      rejectUnauthorized: false,
      lookup(hostname, options, callback) {
        dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
          if (err) return callback(err, [] as never, undefined as never);
          const list = Array.isArray(addresses) ? addresses : [addresses];
          for (const a of list) {
            const addr = typeof a === 'string' ? a : a.address;
            const c = checkIp(addr, opts.blockedIps);
            if (!c.ok) return callback(new Error(`Refusing to connect to ${hostname} (${addr}): ${c.reason}`), [] as never, undefined as never);
          }
          // ipv4first: prefer v4 like browsers do; undici accepts the array form.
          const sorted = [...list].sort((a, b) => (typeof a === 'string' ? 0 : a.family) - (typeof b === 'string' ? 0 : b.family));
          callback(null, sorted as never, undefined as never);
        });
      }
    },
    headersTimeout: opts.timeoutMs ?? 10_000,
    bodyTimeout: opts.timeoutMs ?? 10_000
  });
}

/**
 * A fetch() bound to the safe dispatcher. Uses undici's own fetch: Node's global fetch is
 * built on a bundled undici that rejects dispatchers from the npm package.
 */
export function createSafeFetch(dispatcher: Dispatcher): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => undiciFetch(input as never, { ...(init ?? {}), dispatcher } as never) as unknown as Promise<Response>) as typeof fetch;
}
