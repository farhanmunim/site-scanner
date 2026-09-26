import { describe, expect, it } from 'vitest';
import { checkIp, reverseName } from '../src/gather/ip.js';
import { normaliseTarget, TargetError, toUnicodeHost } from '../src/gather/url.js';
import { checkDenylist, isPathAllowed, RequestBudget, LIMITS } from '../src/gather/policy.js';
import { safeFetch, fetchDocument, FetchDenied, redactSetCookie } from '../src/gather/fetch.js';

describe('SSRF guard: checkIp', () => {
  const blocked = ['127.0.0.1', '127.8.8.8', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '100.127.255.255', '198.18.0.1', '224.0.0.1', '255.255.255.255', '192.0.2.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::7f00:1', '2001:db8::1', 'ff02::1'];
  for (const ip of blocked) it(`blocks ${ip}`, () => expect(checkIp(ip).ok).toBe(false));
  const allowed = ['8.8.8.8', '1.1.1.1', '104.16.0.1', '172.32.0.1', '2606:4700::1111', '2a00:1450:4009::1'];
  for (const ip of allowed) it(`allows ${ip}`, () => expect(checkIp(ip).ok).toBe(true));
  it('blocks our own IP when listed', () => {
    expect(checkIp('203.0.113.9', new Set(['203.0.113.9'])).ok).toBe(false);
    expect(checkIp('5.6.7.8', new Set(['5.6.7.8'])).ok).toBe(false);
    expect(checkIp('5.6.7.9', new Set(['5.6.7.8'])).ok).toBe(true);
  });
  it('rejects garbage', () => expect(checkIp('not-an-ip').ok).toBe(false));
  it('reverse names', () => {
    expect(reverseName('1.2.3.4')).toBe('4.3.2.1.in-addr.arpa');
    expect(reverseName('2001:db8::1')).toMatch(/\.ip6\.arpa$/);
  });
});

describe('URL normalisation', () => {
  it('adds https and trailing slash', () => expect(normaliseTarget('example.com').url).toBe('https://example.com/'));
  it('keeps paths and strips utm', () => expect(normaliseTarget('http://Example.COM/page?utm_source=x&id=2#frag').url).toBe('http://example.com/page?id=2'));
  it('rejects IP literals', () => expect(() => normaliseTarget('http://127.0.0.1/')).toThrow(TargetError));
  it('rejects IPv6 literals', () => expect(() => normaliseTarget('http://[::1]/')).toThrow(TargetError));
  it('rejects non-http schemes', () => expect(() => normaliseTarget('ftp://example.com')).toThrow(/http/));
  it('rejects odd ports', () => expect(() => normaliseTarget('https://example.com:22/')).toThrow(/port/i));
  it('rejects credentials', () => expect(() => normaliseTarget('https://user:pw@example.com/')).toThrow(/credentials/));
  it('rejects non-ICANN / single-label', () => {
    expect(() => normaliseTarget('localhost')).toThrow(TargetError);
    expect(() => normaliseTarget('intranet')).toThrow(TargetError);
    expect(() => normaliseTarget('foo.internal')).toThrow(TargetError);
  });
  it('computes registrable domain + subdomain flag', () => {
    const t = normaliseTarget('https://shop.example.co.uk/');
    expect(t.registrableDomain).toBe('example.co.uk');
    expect(t.isSubdomain).toBe(true);
    expect(normaliseTarget('www.example.com').isSubdomain).toBe(false);
  });
  it('decodes IDN for display', () => {
    expect(toUnicodeHost('xn--mnchen-3ya.de')).toBe('münchen.de');
    expect(toUnicodeHost('xn--80ak6aa92e.com')).toBe('аррӏе.com');
  });
});

describe('Target policy', () => {
  const target = { host: 'example.com', url: 'https://example.com/' };
  it('allows the target and well-known files', () => {
    expect(isPathAllowed('https://example.com/', target).allowed).toBe(true);
    expect(isPathAllowed('https://example.com/robots.txt', target).allowed).toBe(true);
    expect(isPathAllowed('https://www.example.com/sitemap.xml', target).allowed).toBe(true);
  });
  it('refuses sensitive paths and anything not referenced', () => {
    for (const p of ['/.env', '/.git/HEAD', '/wp-config.php.bak', '/server-status', '/admin', '/wp-login.php', '/?s=x', '/robots.txt?x=1']) {
      expect(isPathAllowed('https://example.com' + p, target).allowed, p).toBe(false);
    }
  });
  it('allows only scripts the page referenced, including off-site', () => {
    const ctx = { discoveredScripts: new Set(['https://cdn.example.net/app.js']) };
    expect(isPathAllowed('https://cdn.example.net/app.js', target, ctx).allowed).toBe(true);
    expect(isPathAllowed('https://cdn.example.net/other.js', target, ctx).allowed).toBe(false);
  });
  it('allows WordPress public files only once WordPress is detected', () => {
    expect(isPathAllowed('https://example.com/wp-json/', target).allowed).toBe(false);
    expect(isPathAllowed('https://example.com/wp-json/', target, { wordpress: true }).allowed).toBe(true);
    expect(isPathAllowed('https://example.com/wp-content/plugins/akismet/readme.txt', target, { wordpress: true }).allowed).toBe(true);
    expect(isPathAllowed('https://example.com/wp-content/plugins/akismet/akismet.php', target, { wordpress: true }).allowed).toBe(false);
  });
  it('budget is enforced', () => {
    const b = new RequestBudget(0, 2);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    expect(LIMITS.maxRequestsPerScan).toBeLessThanOrEqual(30);
  });
  it('denylist blocks gov/mil/nhs and opted-out domains, and ourselves', () => {
    expect(checkDenylist('www.gov.uk').denied).toBe(true);
    expect(checkDenylist('army.mil').denied).toBe(true);
    expect(checkDenylist('trust.nhs.uk').denied).toBe(true);
    expect(checkDenylist('example.com', { blockedDomains: ['example.com'] }).denied).toBe(true);
    expect(checkDenylist('a.example.com', { blockedDomains: ['example.com'] }).denied).toBe(true);
    expect(checkDenylist('scanner.farhan.app', { ownHosts: ['scanner.farhan.app'] }).denied).toBe(true);
    expect(checkDenylist('example.com').denied).toBe(false);
  });
});

describe('safeFetch', () => {
  const selfUrl = 'https://scanner.test';
  it('never sends POST and never follows redirects itself', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl: typeof fetch = async (_u, init) => {
      calls.push(init!);
      return new Response('<html></html>', { status: 302, headers: { location: 'https://example.com/next' } });
    };
    const budget = new RequestBudget();
    const preResolved = new Map([['example.com', true]]);
    const r = await safeFetch('https://example.com/', { selfUrl, budget, target: { host: 'example.com', url: 'https://example.com/' }, fetchImpl, preResolved });
    expect(r.status).toBe(302);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.redirect).toBe('manual');
    expect(String((calls[0]!.headers as Record<string, string>)['user-agent'])).toContain('SiteScanBot');
  });
  it('refuses paths off the allowlist before any network call', async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response('');
    };
    await expect(safeFetch('https://example.com/.env', { selfUrl, budget: new RequestBudget(), target: { host: 'example.com', url: 'https://example.com/' }, fetchImpl })).rejects.toThrow(FetchDenied);
    expect(called).toBe(false);
  });
  it('refuses hosts that resolve to private addresses (via DoH) and blocks redirects into them', async () => {
    const fetchImpl: typeof fetch = async (u) => {
      const s = String(u);
      if (s.includes('dns-query') || s.includes('dns.google')) {
        const name = new URL(s).searchParams.get('name');
        const type = new URL(s).searchParams.get('type');
        const ip = name === 'evil.example' ? '10.0.0.1' : '93.184.216.34';
        return new Response(JSON.stringify({ Status: 0, Answer: type === 'A' ? [{ name, type: 1, TTL: 1, data: ip }] : [] }), { headers: { 'content-type': 'application/dns-json' } });
      }
      if (s === 'https://good.example/') return new Response('', { status: 301, headers: { location: 'https://evil.example/' } });
      return new Response('should not reach');
    };
    const opts = { selfUrl, budget: new RequestBudget(), target: { host: 'good.example', url: 'https://good.example/' }, fetchImpl, preResolved: new Map<string, boolean>() };
    await expect(safeFetch('https://evil.example/', { ...opts, target: { host: 'evil.example', url: 'https://evil.example/' } })).rejects.toThrow(/non-public/);
    const doc = await fetchDocument('https://good.example/', opts);
    expect(doc.final).toBeNull();
    expect(doc.deniedReason).toMatch(/non-public/);
    expect(doc.chain[0]?.location).toBe('https://evil.example/');
  });
  it('caps body size', async () => {
    const big = 'x'.repeat(100_000);
    const fetchImpl: typeof fetch = async () => new Response(big);
    const r = await safeFetch('https://example.com/', { selfUrl, budget: new RequestBudget(), target: { host: 'example.com', url: 'https://example.com/' }, fetchImpl, preResolved: new Map([['example.com', true]]), maxBytes: 1000 });
    expect(r.body.length).toBe(1000);
    expect(r.truncated).toBe(true);
  });
  it('stops after the budget is spent', async () => {
    const fetchImpl: typeof fetch = async () => new Response('ok');
    const budget = new RequestBudget(LIMITS.maxRequestsPerScan);
    await expect(safeFetch('https://example.com/', { selfUrl, budget, target: { host: 'example.com', url: 'https://example.com/' }, fetchImpl, preResolved: new Map([['example.com', true]]) })).rejects.toThrow(/budget/);
  });
  it('redacts cookie values', () => {
    expect(redactSetCookie('session=abc123; Path=/; HttpOnly; Secure')).toBe('session=<redacted>; Path=/; HttpOnly; Secure');
  });
});
