import { LIMITS, USER_AGENT, checkDenylist, isPathAllowed, type RequestBudget } from './policy.js';
import { checkIp } from './ip.js';
import { resolveAddresses } from './doh.js';
import type { HttpResponseInfo, RedirectHop } from '../types.js';

export interface SafeFetchOptions {
  /** Site URL of the scanner, used in the honest User-Agent. */
  selfUrl: string;
  budget: RequestBudget;
  target: { host: string; url: string };
  context?: Parameters<typeof isPathAllowed>[2];
  /** Additional IPs never to contact (our own origin etc.). */
  blockedIps?: ReadonlySet<string>;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  method?: 'GET' | 'HEAD';
  accept?: string;
  /** Read the body as bytes (images); `body` stays empty and `bytes` is set. */
  binary?: boolean;
  /** Skip the DoH pre-check when the caller already resolved + validated the host. */
  preResolved?: Map<string, boolean>;
  /** Denylist inputs re-applied to every URL fetched (redirect hops and third-party scripts included). */
  deny?: { extraSuffixes?: string[]; blockedDomains?: Iterable<string>; ownHosts?: Iterable<string> };
}

export class FetchDenied extends Error {
  constructor(
    public code: 'policy' | 'ssrf' | 'budget' | 'dns',
    message: string
  ) {
    super(message);
    this.name = 'FetchDenied';
  }
}

export interface SafeResponse {
  /** Set instead of `body` when the request asked for binary. */
  bytes?: Uint8Array;
  status: number;
  headers: Record<string, string>;
  cookies: string[];
  body: string;
  truncated: boolean;
  url: string;
  timingMs: number;
}

/** Header names whose values may contain secrets or PII: keep the name, drop the value. */
const REDACT_HEADERS = new Set(['set-cookie', 'authorization', 'proxy-authorization', 'www-authenticate']);

/** Keep the cookie name and attributes; drop the value (it might be a session token). */
export function redactSetCookie(v: string): string {
  const [pair, ...attrs] = v.split(';');
  const name = (pair ?? '').split('=')[0]?.trim() ?? '';
  return [name + '=<redacted>', ...attrs.map((a) => a.trim())].join('; ');
}

function headersToRecord(h: Headers): { headers: Record<string, string>; cookies: string[] } {
  const headers: Record<string, string> = {};
  const cookies: string[] = [];
  const getSetCookie = (h as Headers & { getSetCookie?: () => string[] }).getSetCookie?.bind(h);
  if (getSetCookie) for (const c of getSetCookie()) cookies.push(redactSetCookie(c));
  h.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'set-cookie') {
      if (!getSetCookie) cookies.push(redactSetCookie(value));
      return;
    }
    if (REDACT_HEADERS.has(k)) {
      headers[k] = '<redacted>';
      return;
    }
    headers[k] = headers[k] ? headers[k] + ', ' + value : value;
  });
  return { headers, cookies };
}

async function readCappedBytes(res: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!res.body) return { bytes: new Uint8Array(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.length > maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) (out.set(c, o), (o += c.length));
  return { bytes: out, truncated };
}

async function readCapped(res: Response, maxBytes: number): Promise<{ body: string; truncated: boolean }> {
  if (!res.body) return { body: '', truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.byteLength;
  }
  return { body: new TextDecoder('utf-8', { fatal: false }).decode(merged), truncated };
}

/**
 * Validate that every address `host` resolves to is public. Cached per scan via `preResolved`.
 */
export async function assertPublicHost(host: string, opts: Pick<SafeFetchOptions, 'blockedIps' | 'fetchImpl' | 'preResolved'>): Promise<string[]> {
  const cached = opts.preResolved?.get(host);
  if (cached === true) return [];
  if (cached === false) throw new FetchDenied('ssrf', `${host} resolves to a non-public address`);
  let addrs: { v4: string[]; v6: string[] };
  try {
    addrs = await resolveAddresses(host, opts.fetchImpl);
  } catch {
    throw new FetchDenied('dns', `Could not resolve ${host}`);
  }
  const all = [...addrs.v4, ...addrs.v6];
  if (all.length === 0) throw new FetchDenied('dns', `${host} has no public address records`);
  for (const ip of all) {
    const c = checkIp(ip, opts.blockedIps);
    if (!c.ok) {
      opts.preResolved?.set(host, false);
      throw new FetchDenied('ssrf', `${host} resolves to ${ip} (${c.reason})`);
    }
  }
  opts.preResolved?.set(host, true);
  return all;
}

/**
 * One policy-checked request. Does NOT follow redirects (callers walk the chain so every
 * hop is re-validated). Never retries. Never sends a body.
 */
export async function safeFetch(url: string, opts: SafeFetchOptions): Promise<SafeResponse> {
  const perm = isPathAllowed(url, opts.target, opts.context);
  if (!perm.allowed) throw new FetchDenied('policy', `Refusing to fetch ${url}: ${perm.reason}`);
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname;
  // Every URL, not just the first: no IP literals, only standard web ports, and the same denylist/opt-out list.
  if (host.startsWith('[') || /^[0-9.]+$/.test(host)) throw new FetchDenied('policy', 'Refusing to fetch an IP address');
  const port = parsedUrl.port ? Number(parsedUrl.port) : parsedUrl.protocol === 'https:' ? 443 : 80;
  if (![80, 443, 8080, 8443].includes(port)) throw new FetchDenied('policy', `Refusing to fetch port ${port}`);
  if (opts.deny) {
    const d = checkDenylist(host, opts.deny);
    if (d.denied) throw new FetchDenied('policy', d.reason ?? 'This host is not scanned');
  }
  if (!opts.budget.take()) throw new FetchDenied('budget', 'Per-scan request budget exhausted');

  await assertPublicHost(host, opts);

  const fetchImpl = opts.fetchImpl ?? fetch;
  const started = Date.now();
  const res = await fetchImpl(url, {
    method: opts.method ?? 'GET',
    redirect: 'manual',
    headers: {
      'user-agent': USER_AGENT(opts.selfUrl),
      accept: opts.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-GB,en;q=0.9',
      'accept-encoding': 'gzip, deflate, br'
    },
    signal: AbortSignal.timeout(opts.timeoutMs ?? LIMITS.requestTimeoutMs),
    // Cloudflare-specific: never cache target responses at the edge.
    ...({ cf: { cacheTtl: 0, cacheEverything: false } } as object)
  });
  const { headers, cookies } = headersToRecord(res.headers);
  if (opts.binary) {
    const { bytes, truncated } = await readCappedBytes(res, opts.maxBytes ?? LIMITS.maxFileBytes);
    return { status: res.status, headers, cookies, body: '', bytes, truncated, url, timingMs: Date.now() - started };
  }
  const { body, truncated } = opts.method === 'HEAD' ? { body: '', truncated: false } : await readCapped(res, opts.maxBytes ?? LIMITS.maxFileBytes);
  return { status: res.status, headers, cookies, body, truncated, url, timingMs: Date.now() - started };
}

/**
 * Follow a redirect chain manually, validating every hop against the policy and the
 * SSRF guard. Off-site redirects (e.g. example.com -> example.co.uk) are followed only
 * to the final host if it is public; the scan's target host is updated by the caller.
 */
export async function fetchDocument(
  startUrl: string,
  opts: SafeFetchOptions
): Promise<{ chain: RedirectHop[]; final: HttpResponseInfo | null; deniedReason?: string }> {
  const chain: RedirectHop[] = [];
  let current = startUrl;
  const seen = new Set<string>();

  for (let hop = 0; hop <= LIMITS.maxRedirects; hop++) {
    if (seen.has(current)) {
      chain.push({ url: current, status: 0, location: 'redirect loop' });
      return { chain, final: null, deniedReason: 'Redirect loop detected' };
    }
    seen.add(current);

    // Redirect hops may land on another host: re-run the policy with that host as target.
    const hopTarget = { host: new URL(current).hostname, url: current };
    let res: SafeResponse;
    try {
      res = await safeFetch(current, { ...opts, target: hopTarget, maxBytes: LIMITS.maxHtmlBytes });
    } catch (e) {
      if (e instanceof FetchDenied) return { chain, final: null, deniedReason: e.message };
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      return { chain, final: null, deniedReason: `Network error: ${cause?.code ?? cause?.message ?? (e as Error).message}` };
    }

    if (res.status >= 300 && res.status < 400 && res.headers['location']) {
      let next: string;
      try {
        next = new URL(res.headers['location'], current).toString();
      } catch {
        chain.push({ url: current, status: res.status, location: res.headers['location'] });
        return { chain, final: null, deniedReason: 'Invalid redirect location' };
      }
      chain.push({ url: current, status: res.status, location: next });
      current = next;
      continue;
    }

    chain.push({ url: current, status: res.status });
    const ct = res.headers['content-type'] ?? null;
    const cl = res.headers['content-length'] ? Number(res.headers['content-length']) : null;
    return {
      chain,
      final: {
        url: current,
        status: res.status,
        headers: res.headers,
        cookies: res.cookies,
        contentType: ct,
        contentLength: Number.isFinite(cl) ? cl : null,
        body: res.body,
        bodyTruncated: res.truncated,
        protocol: null,
        timingMs: res.timingMs
      }
    };
  }
  return { chain, final: null, deniedReason: `More than ${LIMITS.maxRedirects} redirects` };
}
