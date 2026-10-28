import { parse as parseDomain } from 'tldts';

export interface NormalisedTarget {
  input: string;
  url: string;
  host: string;
  displayHost: string;
  registrableDomain: string;
  isSubdomain: boolean;
  port: number;
}

export class TargetError extends Error {
  constructor(
    public code:
      | 'invalid'
      | 'scheme'
      | 'port'
      | 'ip-literal'
      | 'credentials'
      | 'tld'
      | 'denied'
      | 'private',
    message: string
  ) {
    super(message);
    this.name = 'TargetError';
  }
}

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

/**
 * Turn user input into a single canonical URL we are allowed to scan.
 * Accepts "example.com", "https://example.com/page", "http://sub.example.com:8080".
 * Rejects IP literals (no CDN/DNS intelligence, and a common SSRF vector), credentials,
 * non-http schemes and unusual ports.
 */
export function normaliseTarget(input: string): NormalisedTarget {
  let raw = input.trim();
  if (raw.length === 0 || raw.length > 2048) throw new TargetError('invalid', 'Enter a website address.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TargetError('invalid', 'That does not look like a valid website address.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetError('scheme', 'Only http:// and https:// websites can be scanned.');
  }
  if (url.username || url.password) throw new TargetError('credentials', 'URLs with credentials are not accepted.');

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) throw new TargetError('port', 'Only standard web ports (80, 443, 8080, 8443) are scanned.');

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || /^[0-9.]+$/.test(host)) {
    throw new TargetError('ip-literal', 'Enter a domain name rather than an IP address.');
  }

  const parsed = parseDomain(host, { allowPrivateDomains: true });
  // Private suffixes (github.io, vercel.app, ...) are separate sites: treat them as registrable.
  if (!parsed.domain || !(parsed.isIcann || parsed.isPrivate)) {
    throw new TargetError('tld', 'Enter a public domain name (for example example.com).');
  }

  url.hostname = host;
  url.hash = '';
  // Drop tracking noise but keep meaningful query strings.
  for (const k of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_|_hs)/i.test(k)) url.searchParams.delete(k);
  }
  if (url.pathname === '') url.pathname = '/';

  const displayHost = toUnicodeHost(host);

  return {
    input,
    url: url.toString(),
    host,
    displayHost,
    registrableDomain: parsed.domain,
    isSubdomain: parsed.subdomain !== '' && parsed.subdomain !== 'www',
    port
  };
}

/** Unicode display form of a punycode (IDNA) hostname. RFC 3492 decoder, no deps. */
export function toUnicodeHost(host: string): string {
  if (!host.includes('xn--')) return host;
  return host
    .split('.')
    .map((label) => (label.startsWith('xn--') ? punycodeDecode(label.slice(4)) ?? label : label))
    .join('.');
}

function punycodeDecode(input: string): string | null {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700, initialBias = 72, initialN = 128;
  const output: number[] = [];
  let basic = input.lastIndexOf('-');
  if (basic < 0) basic = 0;
  for (let j = 0; j < basic; j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) return null;
    output.push(c);
  }
  let n = initialN, bias = initialBias, i = 0;
  const digit = (c: number) => (c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base);
  const adapt = (delta: number, numPoints: number, first: boolean) => {
    delta = first ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > ((base - tMin) * tMax) >> 1) {
      delta = Math.floor(delta / (base - tMin));
      k += base;
    }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
  };
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length; ) {
    const oldi = i;
    let w = 1;
    for (let k = base; ; k += base) {
      if (idx >= input.length) return null;
      const d = digit(input.charCodeAt(idx++));
      if (d >= base) return null;
      i += d * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (d < t) break;
      w *= base - t;
    }
    const out = output.length + 1;
    bias = adapt(i - oldi, out, oldi === 0);
    n += Math.floor(i / out);
    i %= out;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

/** Same registrable domain (used for redirect + link classification). */
export function sameSite(a: string, b: string): boolean {
  const pa = parseDomain(a).domain;
  const pb = parseDomain(b).domain;
  return !!pa && pa === pb;
}
