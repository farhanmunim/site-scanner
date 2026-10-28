import { describe, expect, it } from 'vitest';
import { inspectSpf } from '../src/gather/stages/spf.js';
import { compareVersions } from '../src/version.js';
import { affectsVersion, analyseWordPress, findExposedSecrets, detectPhp, auditDomain, fixedIn } from '../src/analyze/index.js';
import { checkIp } from '../src/gather/ip.js';
import { safeFetch, FetchDenied } from '../src/gather/fetch.js';
import { RequestBudget } from '../src/gather/policy.js';
import { normaliseTarget } from '../src/gather/url.js';
import type { WordfenceVuln } from '../src/types.js';

describe('SPF: counts every evaluation', () => {
  it('counts a shared include once per branch (RFC 7208)', async () => {
    const zone: Record<string, string[]> = {
      'a.test': ['v=spf1 include:x.test include:y.test -all'],
      'x.test': ['v=spf1 include:shared.test -all'],
      'y.test': ['v=spf1 include:shared.test -all'],
      'shared.test': ['v=spf1 a mx ip4:1.1.1.1 -all']
    };
    const r = await inspectSpf('a.test', zone['a.test']!, async (n) => zone[n] ?? []);
    // root 2 + x 1 + y 1 + shared 2 (a, mx) x 2 branches = 8
    expect(r!.totalLookups).toBe(8);
    expect(r!.errors.join()).not.toMatch(/loop/);
  });
  it('reads `all` from a redirect target and ignores redirect= when `all` is present', async () => {
    const zone: Record<string, string[]> = { 'a.test': ['v=spf1 redirect=_spf.test'], '_spf.test': ['v=spf1 ip4:1.1.1.1 ~all'] };
    expect((await inspectSpf('a.test', zone['a.test']!, async (n) => zone[n] ?? []))!.allQualifier).toBe('~');
    const both = await inspectSpf('a.test', ['v=spf1 -all redirect=_spf.test'], async (n) => zone[n] ?? []);
    expect(both!.totalLookups).toBe(0);
  });
});

describe('version comparison', () => {
  it('orders pre-releases before releases', () => {
    expect(compareVersions('1.0.0-beta1', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0rc1', '2.0.0')).toBeLessThan(0);
    expect(compareVersions('1.2.3a', '1.2.3')).toBeLessThan(0);
    expect(compareVersions('6.9.11', '6.10.0')).toBeLessThan(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });
  const vuln: WordfenceVuln = { id: '1', title: 't', cve: null, cvss: null, ranges: [{ from: null, fromInclusive: true, to: '1.0.0', toInclusive: false }], patched: ['1.2.3', '2.0.1'] } as unknown as WordfenceVuln;
  it('treats a release candidate as affected by "< 1.0.0"', () => {
    expect(affectsVersion(vuln, '1.0.0-beta1')).toBe(true);
    expect(affectsVersion(vuln, '1.0.0')).toBe(false);
  });
  it('picks the patched release above the installed version', () => {
    expect(fixedIn(vuln, '2.0.0')).toBe('2.0.1');
    expect(fixedIn(vuln, '1.0.0')).toBe('1.2.3');
  });
});

describe('WordPress core version', () => {
  it('ignores bundled jQuery ?ver= and uses the core assets', () => {
    const html = `<meta name="generator" content="x"><link rel="https://api.w.org/" href="https://e.test/wp-json/"><script src="/wp-includes/js/jquery/jquery.min.js?ver=3.7.1"></script><link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css?ver=6.5.2"><link rel="stylesheet" href="/wp-includes/css/classic-themes.min.css?ver=6.5.2">`;
    const r = analyseWordPress(html, null, [], undefined, {}, 'https://e.test/');
    expect(r?.version).toBe('6.5.2');
  });
});

describe('secrets', () => {
  it('keeps severity order when many low hits appear first', () => {
    const noise = Array.from({ length: 40 }, (_, i) => `"password":"abcdef${i}12345"`).join(',');
    const found = findExposedSecrets([{ source: 'page', text: `${noise} AKIAIOSFODNN7REALKEY ${'sk_live_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'}` }]);
    expect(found.length).toBeLessThanOrEqual(25);
    expect(found[0]!.severity).toBe('high');
  });
  it('does not flag translation strings', () => {
    expect(findExposedSecrets([{ source: 'p', text: '{"password":"Wachtwoord"}' }])).toHaveLength(0);
  });
  it('does not drop a real key that merely contains "test"', () => {
    expect(findExposedSecrets([{ source: 'p', text: 'x ghp_' + 'a1B2c3D4test5F6g7H8i9J0k1L2m3N4o5P6q7R' }]).length).toBe(1);
  });
});

describe('php and domain edge cases', () => {
  const none = { headers: {}, cookies: [] as string[], html: null };
  it('treats PHP 5.3 as end-of-life', () => {
    const r = detectPhp({ 'x-powered-by': 'PHP/5.3.29' }, [], null, [], new Date('2026-01-01'));
    expect(r.supported).toBe(false);
    void none;
  });
  it('downgrades EOL on distro builds to a warning', () => {
    const r = detectPhp({ 'x-powered-by': 'PHP/7.4.33-1+ubuntu22.04.1+deb.sury.org+1' }, [], null, [], new Date('2026-01-01'));
    expect(r.findings[0]!.status).toBe('warn');
  });
  it('survives malformed RDAP dates', () => {
    const f = auditDomain({ expires: '2026-13-45', created: 'nope', status: [] } as never);
    expect(f.join()).not.toMatch(/NaN/);
  });
});

describe('network guards', () => {
  it('blocks IPv4-compatible and SIIT IPv6 forms', () => {
    for (const ip of ['::7f00:1', '::ffff:0:169.254.169.254', '3fff::1', '5f00::1']) expect(checkIp(ip).ok, ip).toBe(false);
    expect(checkIp('2606:4700:4700::1111').ok).toBe(true);
  });
  const base = { selfUrl: 'https://s.test', budget: new RequestBudget(), target: { host: 'a.test', url: 'https://a.test/' }, fetchImpl: (async () => new Response('ok')) as typeof fetch, preResolved: new Map([['example.org', true]]) };
  it('refuses odd ports, IP literals and opted-out hosts on every URL', async () => {
    await expect(safeFetch('http://example.org:6379/', { ...base, context: { allowOffSite: true } as never })).rejects.toBeInstanceOf(FetchDenied);
    await expect(safeFetch('http://93.184.216.34/', { ...base, context: { allowOffSite: true } as never })).rejects.toBeInstanceOf(FetchDenied);
    await expect(safeFetch('https://optout.example.org/', { ...base, context: { allowOffSite: true } as never, deny: { blockedDomains: ['example.org'] } })).rejects.toBeInstanceOf(FetchDenied);
  });
  it('uses private suffixes as separate sites', () => {
    expect(normaliseTarget('https://alice.github.io/').registrableDomain).toBe('alice.github.io');
    expect(normaliseTarget('https://bob.github.io/').registrableDomain).toBe('bob.github.io');
    expect(normaliseTarget('https://en.wikipedia.org/').registrableDomain).toBe('wikipedia.org');
  });
});

import { detectPlatform } from '../src/analyze/platform.js';
import type { TechnologyDetection } from '../src/types.js';
const tech = (o: Partial<TechnologyDetection>): TechnologyDetection => ({ name: 'X', slug: 'x', categories: [{ id: 1, name: 'CMS' }], confidence: 'high', score: 100, version: null, website: null, description: null, evidence: [{ source: 'meta', key: 'generator', value: 'X' }], implied: false, ...o });
describe('platform verdict', () => {
  it('prefers a real builder over a DNS-verification hint', () => {
    const v = detectPlatform([tech({ name: 'Notion', categories: [{ id: 51, name: 'Page builders' }], score: 20, confidence: 'low' }), tech({ name: 'Framer Sites', categories: [{ id: 51, name: 'Page builders' }], saas: true })]);
    expect(v?.name).toBe('Framer Sites');
    expect(v?.kind).toBe('builder');
  });
  it('falls back to a framework and ignores libraries', () => {
    expect(detectPlatform([tech({ name: 'jQuery', categories: [{ id: 59, name: 'JS libs' }] })])).toBeNull();
    expect(detectPlatform([tech({ name: 'Next.js', categories: [{ id: 18, name: 'Web frameworks' }] })])?.kind).toBe('framework');
  });
});
