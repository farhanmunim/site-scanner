import { describe, expect, it } from 'vitest';
import { inspectSpf } from '../src/gather/stages/spf.js';
import { checkPropagation } from '../src/gather/stages/propagation.js';
import { dnsblName, fetchBlocklists, fetchWordfence, resetWordfenceMemo, findVulnerableLibraries, normaliseRepo } from '../src/external/index.js';
import { affectsVersion, analyseWordPress, auditDomain, detectPhp, findExposedSecrets, analyseAiReadiness, auditEmail } from '../src/analyze/index.js';
import type { DnsRecords, FetchedFile, WordfenceVuln } from '../src/types.js';

const file = (body: string, status = 200): FetchedFile => ({ path: '/x', status, contentType: 'text/plain', body, truncated: false });

describe('SPF inspector', () => {
  const zone: Record<string, string[]> = {
    'a.test': ['v=spf1 include:b.test include:c.test mx -all'],
    'b.test': ['v=spf1 ip4:1.2.3.4 include:d.test ~all'],
    'c.test': ['v=spf1 a ptr ip6:2001:db8::/32 -all'],
    'd.test': ['v=spf1 ip4:5.6.7.8 -all']
  };
  const txt = async (n: string) => zone[n] ?? [];
  it('counts lookups across the include tree', async () => {
    const r = await inspectSpf('a.test', zone['a.test']!, txt);
    // root: include b, include c, mx = 3; b: include d = 1; c: a, ptr = 2
    expect(r!.totalLookups).toBe(6);
    expect(r!.allQualifier).toBe('-');
    expect(r!.hasPtr).toBe(true);
    expect(r!.ip4Count).toBe(2);
    expect(r!.tree.children.map((c) => c.domain)).toEqual(['b.test', 'c.test']);
  });
  it('counts void lookups and detects loops', async () => {
    const r = await inspectSpf('a.test', ['v=spf1 include:gone.test include:a.test -all'], async (n) => zone[n] ?? []);
    expect(r!.voidLookups).toBe(1);
    expect(r!.errors.join()).toMatch(/gone.test/);
    expect(r!.errors.join()).toMatch(/includes itself/);
  });
  it('flags multiple root records and returns null without SPF', async () => {
    expect((await inspectSpf('a.test', ['v=spf1 -all', 'v=spf1 +all'], txt))!.recordCount).toBe(2);
    expect(await inspectSpf('a.test', ['hello'], txt)).toBeNull();
  });
});

describe('propagation', () => {
  it('reports consistency and ignores resolvers that did not answer', async () => {
    const resolvers = [1, 2, 3].map((n) => ({ name: `r${n}`, ip: `10.0.0.${n}` }));
    const d = await checkPropagation('x.test', {
      types: ['A', 'NS'],
      resolvers,
      query: async (r, _h, type) => (type === 'A' ? (r.name === 'r1' ? ['1.1.1.1'] : r.name === 'r2' ? ['2.2.2.2'] : null) : ['ns1.x.test']) as string[] | null
    });
    expect(d.rows.find((r) => r.type === 'A')!.consistent).toBe(false);
    expect(d.rows.find((r) => r.type === 'NS')!.consistent).toBe(true);
    expect(d.rows[0]!.answers.find((a) => a.resolver.name === 'r3')!.values).toBeNull();
  });
});

describe('propagation sanity check', () => {
  const resolvers = [1, 2].map((n) => ({ name: `r${n}`, ip: `10.0.0.${n}` }));
  it('does not trust uniformly empty answers when another path sees records', async () => {
    const d = await checkPropagation('x.test', { types: ['MX', 'AAAA'], resolvers, query: async () => [], reference: async (_h, t) => (t === 'MX' ? ['10 mx.x.test'] : []) });
    const mx = d.rows.find((r) => r.type === 'MX')!;
    expect(mx.answers.every((a) => a.values === null)).toBe(true);
    expect(mx.note).toMatch(/DNS-over-HTTPS/);
    const aaaa = d.rows.find((r) => r.type === 'AAAA')!;
    expect(aaaa.answers.every((a) => a.values?.length === 0)).toBe(true);
    expect(aaaa.note).toBeUndefined();
  });
});

describe('blocklists', () => {
  it('reverses IPv4 for DNSBL', () => {
    expect(dnsblName('1.2.3.4', 'zen.example')).toBe('4.3.2.1.zen.example');
    expect(dnsblName('2001:db8::1', 'zen.example')).toBeNull();
  });
  it('separates listed, clean and refused', async () => {
    const dns = { MX: [], } as unknown as DnsRecords;
    const ips = [{ ip: '9.9.9.9', version: 4 as const, asn: 1, asnOrg: 'Some ISP', country: 'US', prefix: null, reverseDns: null }, { ip: '104.16.0.1', version: 4 as const, asn: 13335, asnOrg: 'CLOUDFLARENET', country: 'US', prefix: null, reverseDns: null }];
    const r = await fetchBlocklists(dns, ips, {}, async (name) => {
      if (name.endsWith('zen.spamhaus.org')) return { status: 0, answers: ['127.255.255.254'] };
      if (name.endsWith('bl.spamcop.net')) return { status: 0, answers: ['127.0.0.2'] };
      if (name.endsWith('psbl.surriel.com')) return null;
      return { status: 3, answers: [] };
    });
    expect(r!.checked.map((c) => c.ip)).toEqual(['9.9.9.9']);
    expect(r!.listed).toEqual([{ list: 'bl.spamcop.net', subject: '9.9.9.9', role: 'web', code: '127.0.0.2' }]);
    expect(r!.unavailable.sort()).toEqual(['psbl.surriel.com', 'zen.spamhaus.org']);
  });
});

const vuln = (over: Partial<WordfenceVuln> = {}): WordfenceVuln => ({ title: 'XSS in Foo', cve: 'CVE-2025-1', cvss: 6.1, ranges: [{ from: null, fromInclusive: true, to: '1.4.2', toInclusive: true }], patched: ['1.4.3'], patchedFlag: true, ...over });

describe('Wordfence matching', () => {
  it('applies inclusive and exclusive bounds', () => {
    expect(affectsVersion(vuln(), '1.4.2')).toBe(true);
    expect(affectsVersion(vuln(), '1.4.3')).toBe(false);
    expect(affectsVersion(vuln({ ranges: [{ from: '2.0', fromInclusive: false, to: '3.0', toInclusive: false }] }), '2.0')).toBe(false);
    expect(affectsVersion(vuln({ ranges: [{ from: '2.0', fromInclusive: false, to: '3.0', toInclusive: false }] }), '2.5')).toBe(true);
  });
  it('flags installed vulnerable versions and not fixed ones', () => {
    const html = '<link rel="stylesheet" href="/wp-content/plugins/foo/a.css?ver=1.4.0"><link href="/wp-content/plugins/bar/a.css?ver=9.0.0"><meta name="generator" content="WordPress 6.4.1">';
    const cms = analyseWordPress(html, null, [], { wordfenceVulns: { 'plugin:foo': [vuln()], 'plugin:bar': [vuln()], 'core:wordpress': [] }, wordpressLatest: '6.8.1' }, {});
    expect(cms!.vulnerabilities!.filter((v) => v.affectsInstalled).map((v) => v.slug)).toEqual(['foo']);
    expect(cms!.flags.find((f) => f.id === 'wp-vulnerable')!.status).toBe('bad');
    expect(cms!.flags.find((f) => f.id === 'wp-core-outdated')!.status).toBe('warn');
    expect(cms!.plugins.find((p) => p.slug === 'foo')!.vulnerable).toBe(true);
  });
  it('does not claim a clean bill of health without advisory data', () => {
    const html = '<link href="/wp-content/plugins/foo/a.css?ver=1.4.0"><meta name="generator" content="WordPress 6.4.1">';
    const cms = analyseWordPress(html, null, [], {}, {});
    expect(cms!.flags.map((f) => f.id)).not.toContain('wp-vulnerable');
  });
  it('downloads the feed once and caches per component', async () => {
    resetWordfenceMemo();
    let downloads = 0;
    let auth = '';
    const store = new Map<string, unknown>();
    const cfg = {
      wordfenceApiKey: 'k',
      cache: { get: async (k: string) => store.get(k) as never, set: async (k: string, v: unknown) => void store.set(k, v) },
      fetchImpl: (async (_u: string, init?: RequestInit) => {
        downloads++;
        auth = String((init?.headers as Record<string, string>).authorization);
        return new Response(JSON.stringify({ a: { title: 'T', cve: 'CVE-1', cvss: { score: 7 }, software: [{ type: 'plugin', slug: 'foo', patched: true, patched_versions: ['2.0'], affected_versions: { '* - 1.9': { from_version: '*', from_inclusive: true, to_version: '1.9', to_inclusive: true } } }] } }));
      }) as typeof fetch
    };
    const items = [{ type: 'plugin' as const, slug: 'foo' }, { type: 'theme' as const, slug: 'none' }];
    const first = (await fetchWordfence(items, cfg))!;
    expect(first['plugin:foo']![0]).toMatchObject({ cve: 'CVE-1', cvss: 7, patched: ['2.0'], ranges: [{ from: null, to: '1.9', toInclusive: true }] });
    expect(first['theme:none']).toEqual([]);
    await fetchWordfence(items, cfg);
    expect(downloads).toBe(1);
    expect(auth).toBe('Bearer k');
    expect(await fetchWordfence(items, { ...cfg, wordfenceApiKey: undefined })).toBeNull();
    resetWordfenceMemo();
    expect(await fetchWordfence([{ type: 'core', slug: 'wordpress' }], { wordfenceApiKey: 'k', fetchImpl: (async () => new Response('nope', { status: 500 })) as typeof fetch })).toBeNull();
  });
});

describe('retire.js matching', () => {
  const repo = normaliseRepo({
    jquery: {
      vulnerabilities: [
        { below: '3.5.0', atOrAbove: '1.2.0', severity: 'medium', identifiers: { CVE: ['CVE-2020-11022'], summary: 'XSS in htmlPrefilter' } },
        { below: '1.9.0', severity: 'high', identifiers: { summary: 'old' } }
      ],
      extractors: { uri: ['/(§§version§§)/jquery(\\.min)?\\.js'], filename: ['jquery-(§§version§§)(\\.min)?\\.js'], filecontent: ['/\\*! jQuery v(§§version§§)'] }
    }
  });
  it('identifies by filename and content and compares versions', () => {
    const byName = findVulnerableLibraries(repo, ['https://x.test/js/jquery-3.4.1.min.js'], []);
    expect(byName).toHaveLength(1);
    expect(byName[0]).toMatchObject({ name: 'jquery', version: '3.4.1' });
    expect(byName[0]!.vulns[0]!.cves).toEqual(['CVE-2020-11022']);
    expect(findVulnerableLibraries(repo, ['https://x.test/jquery-3.7.1.min.js'], [])).toEqual([]);
    expect(findVulnerableLibraries(repo, [], [{ source: '/app.js', body: '/*! jQuery v1.8.3 | (c) */' }])[0]!.vulns).toHaveLength(2);
  });
});

describe('PHP', () => {
  it('reads the header and flags end-of-life branches', () => {
    const now = new Date('2026-10-28');
    const old = detectPhp({ 'x-powered-by': 'PHP/7.4.33' }, [], null, [], now);
    expect(old).toMatchObject({ detected: true, version: '7.4.33', branch: '7.4', supported: false });
    expect(old.findings.map((f) => f.id)).toContain('php-eol');
    const eol81 = detectPhp({ 'x-powered-by': 'PHP/8.1.2' }, [], null, [], now);
    expect(eol81.supported).toBe(false);
    expect(detectPhp({ server: 'Apache PHP/8.4.1' }, [], null, [], now)).toMatchObject({ supported: true, source: 'header' });
  });
  it('detects hidden PHP from a session cookie', () => {
    const r = detectPhp({}, ['PHPSESSID=abc'], null, []);
    expect(r).toMatchObject({ detected: true, version: null, source: 'cookie' });
    expect(r.findings[0]!.status).toBe('unknown');
    expect(detectPhp({}, [], null, []).detected).toBe(false);
  });
});

describe('exposed secrets', () => {
  it('finds credentials, redacts them and skips placeholders', () => {
    const r = findExposedSecrets([{ source: '/app.js', text: 'const k="AKIAIOSFODNN7ABCDEFG"; const s="sk_live_' + 'a'.repeat(24) + '"; const e="AKIAEXAMPLEEXAMPLE12"; stripe="pk_live_' + 'b'.repeat(24) + '"' }]);
    expect(r.map((x) => x.kind).sort()).toEqual(['AWS access key ID', 'Stripe secret key']);
    expect(JSON.stringify(r)).not.toContain('IOSFODNN7ABCD');
    expect(r.every((x) => x.source === '/app.js')).toBe(true);
  });
});

describe('domain checks', () => {
  it('warns about imminent expiry and reports the lock', () => {
    const f = auditDomain({ registrar: null, created: '2010-01-01', updated: null, expires: '2026-11-10', status: ['client transfer prohibited'], nameservers: [], dnssecSigned: null }, new Date('2026-10-28'));
    expect(f.find((x) => x.id === 'domain-expiry')).toMatchObject({ status: 'warn' });
    expect(f.find((x) => x.id === 'domain-lock')).toMatchObject({ status: 'good' });
    expect(auditDomain(null)).toEqual([]);
  });
});

describe('AI readiness', () => {
  const robots = (blockedAgents: string[]) => ({ present: true, sitemaps: ['https://x.test/sitemap.xml'], disallowAll: false, groups: 1, aiCrawlers: ['GPTBot', 'ClaudeBot'].map((agent) => ({ agent, blocked: blockedAgents.includes(agent) })) });
  const body = '<html><body>' + '<p>word </p>'.repeat(400) + '<a href="/contact">Contact</a> hello@x.test</body></html>';
  it('scores a well-prepared site high and a blocking, empty one low', () => {
    const good = analyseAiReadiness({ robots: robots([]), llms: file('# X\n- [Docs](https://x.test/docs)'), sitemap: file('<urlset/>'), rawHtml: body, parsed: null, seo: { structuredData: { types: ['Organization'], jsonLdCount: 1, microdata: false, errors: [] } } as never });
    expect(good.grade).toBe('A');
    expect(good.llmsTxt).toEqual({ present: true, hasTitle: true, links: 1 });
    const bad = analyseAiReadiness({ robots: robots(['GPTBot', 'ClaudeBot']), llms: null, sitemap: null, rawHtml: '<div id=root></div>', parsed: null, seo: null });
    expect(bad.grade).toBe('F');
    expect(bad.items.find((i) => i.id === 'readable-content')!.status).toBe('bad');
  });
});

describe('email audit additions', () => {
  it('reports SPF lookup budget, TLS-RPT, DANE and blocklist hits', () => {
    const dns = { MX: [{ priority: 1, exchange: 'mx.x.test' }], TXT: ['v=spf1 -all'], dmarc: [], dkimSelectors: [], mtaSts: [], bimi: [], CAA: [], dnssec: false, tlsRpt: [], tlsa: {}, spf: { totalLookups: 11, voidLookups: 3, allQualifier: '-', hasPtr: true, errors: ['x.test: No SPF record'], tree: {}, ip4Count: 0, ip6Count: 0, recordCount: 1, truncated: false } } as unknown as DnsRecords;
    const f = auditEmail(dns, 'x.test', { checkedAt: '', checked: [{ ip: '1.2.3.4', role: 'mail' }], lists: ['a'], listed: [{ list: 'a', subject: '1.2.3.4', role: 'mail', code: '127.0.0.2' }], unavailable: [] });
    const by = Object.fromEntries(f.map((x) => [x.id, x.status]));
    expect(by).toMatchObject({ 'spf-lookups': 'bad', 'spf-void': 'warn', 'spf-ptr': 'warn', blocklist: 'bad', 'tls-rpt': 'info', dane: 'info' });
  });
});

import { isScope, NOT_NEEDED, planFor, scopeSatisfies, SCOPES } from '../src/scope.js';
import { analyse } from '../src/analyze/index.js';
import type { GatheredData } from '../src/types.js';

describe('scan scopes', () => {
  it('knows every tool and treats anything else as a full scan', () => {
    expect(SCOPES).toContain('email');
    expect(isScope('email')).toBe(true);
    expect(isScope('nope')).toBe(false);
    expect(isScope('__proto__')).toBe(false);
    expect(planFor('nope').stages).toEqual(planFor('full').stages);
    expect(planFor(null).external).toHaveLength(16);
  });
  it('runs only what a tool needs, and pulls in dependencies', () => {
    expect(planFor('spf')).toEqual({ stages: ['dns'], external: [] });
    expect(planFor('email').stages).toEqual(['dns', 'external']);
    expect(planFor('subdomains').stages).toEqual(['external']);
    // files and the browser need the page
    expect(planFor('ai-readiness').stages).toEqual(['http', 'files']);
    expect(planFor('privacy').stages).toEqual(['http', 'files', 'browser']);
    // performance must not drag in the other lookups
    expect(planFor('performance').external).toEqual(['psi', 'crux']);
    for (const s of SCOPES) if (s !== 'full') expect(planFor(s).stages.length).toBeLessThan(planFor('full').stages.length + 1);
  });
  it('lets a full scan answer any request but not the reverse', () => {
    expect(scopeSatisfies('full', 'email')).toBe(true);
    expect(scopeSatisfies('email', 'email')).toBe(true);
    expect(scopeSatisfies('email', 'full')).toBe(false);
    expect(scopeSatisfies('email', 'spf')).toBe(false);
    expect(scopeSatisfies(undefined, 'spf')).toBe(true);
  });
  it('does not call an email-only scan failed, and does not score it', () => {
    const skipped = { status: 'skipped' as const, note: NOT_NEEDED };
    const data: GatheredData = {
      target: { input: 'x.test', url: 'https://x.test/', host: 'x.test', displayHost: 'x.test', registrableDomain: 'x.test', isSubdomain: false },
      scan: { id: '1', createdAt: new Date().toISOString(), scannerVersion: 't', fingerprintsVersion: null, scope: 'email' },
      stages: { dns: { status: 'complete' }, http: skipped, files: skipped, rdap: skipped, cert: skipped, browser: skipped, external: { status: 'complete' } },
      dns: { A: [], AAAA: [], CNAME: [], MX: [{ priority: 1, exchange: 'mx.x.test' }], NS: [], TXT: ['v=spf1 -all'], CAA: [], SOA: null, dnssec: false, dmarc: [], mtaSts: [], dkimSelectors: [], bimi: [] }
    };
    const r = analyse(data);
    expect(r.scan.quality).toBe('complete');
    expect(r.scan.scope).toBe('email');
    expect(r.scores).toBeUndefined();
    expect(r.email.length).toBeGreaterThan(0);
    // the same data as a full scan has no page, which is a failure
    expect(analyse({ ...data, scan: { ...data.scan, scope: 'full' } }).scan.quality).toBe('failed');
  });
});

import { confirmWordPress, extractWordPressRefs } from '../src/gather/stages/files.js';

describe('WordPress confirmation gate (decides whether any WordPress API is called)', () => {
  const page = 'https://example.com/';
  it('is not fooled by pages that merely talk about WordPress', () => {
    expect(confirmWordPress('<p>Use the /wp-json/ endpoint and /wp-includes/ files</p><code>/wp-content/themes/foo/</code>', page).confirmed).toBe(false);
    expect(confirmWordPress('<img src="https://other-blog.com/wp-content/uploads/a.png">', page).confirmed).toBe(false);
    expect(confirmWordPress('<img src="/wp-content/uploads/a.png">', page).confirmed).toBe(false); // one asset alone is only a hint
    expect(extractWordPressRefs('<p>/wp-content/plugins/elementor/ is a plugin</p>', page).pluginSlugs).toEqual([]);
  });
  it('confirms on strong evidence', () => {
    expect(confirmWordPress('<meta name="generator" content="WordPress 6.4.1">', page).signals).toContain('generator meta');
    expect(confirmWordPress('<meta content="WordPress 6.4" name="generator">', page).confirmed).toBe(true);
    expect(confirmWordPress("<link rel='https://api.w.org/' href='https://example.com/wp-json/'>", page).confirmed).toBe(true);
    expect(confirmWordPress('<html></html>', page, { link: '<https://example.com/wp-json/>; rel="https://api.w.org/"' }).confirmed).toBe(true);
    expect(confirmWordPress('<link href="/wp-content/themes/a/style.css"><script src="/wp-includes/js/jquery.js"></script>', page).confirmed).toBe(true);
  });
  it('accepts an image CDN that carries the site name, and two weak hints together', () => {
    expect(confirmWordPress('<img src="https://i0.wp.com/example.com/wp-content/uploads/a.jpg"><img src="https://i1.wp.com/example.com/wp-content/uploads/b.jpg">', page).confirmed).toBe(true);
    expect(confirmWordPress('<img src="/wp-content/uploads/a.png">', page, { 'x-pingback': 'https://example.com/xmlrpc.php' }).confirmed).toBe(true);
  });
  it('reads theme and plugin slugs only from first-party URLs', () => {
    const html = '<meta name="generator" content="WordPress 6.4"><link href="/wp-content/themes/mine/style.css"><script src="/wp-content/plugins/real-plugin/a.js"></script><img src="https://elsewhere.org/wp-content/plugins/not-ours/x.png">';
    const r = extractWordPressRefs(html, page);
    expect(r.themeSlugs).toEqual(['mine']);
    expect(r.pluginSlugs).toEqual(['real-plugin']);
  });
});

describe('Wordfence backoff', () => {
  const store = () => {
    const m = new Map<string, unknown>();
    return { get: async (k: string) => m.get(k) as never, set: async (k: string, v: unknown) => void m.set(k, v) };
  };
  const items = [{ type: 'plugin' as const, slug: 'foo' }];
  it('does not retry the download after a 429, even across a restart, and honours the shared cooldown', async () => {
    resetWordfenceMemo();
    let calls = 0;
    const cache = store();
    const cfg = { wordfenceApiKey: 'k', cache, fetchImpl: (async () => { calls++; return new Response('slow down', { status: 429, headers: { 'retry-after': '120' } }); }) as typeof fetch };
    expect(await fetchWordfence(items, cfg)).toBeNull();
    expect(await fetchWordfence(items, cfg)).toBeNull();
    expect(await fetchWordfence([{ type: 'plugin', slug: 'bar' }], cfg)).toBeNull();
    expect(calls).toBe(1);
    // a new process (memory wiped) still sees the cooldown in the shared cache
    resetWordfenceMemo();
    expect(await fetchWordfence(items, cfg)).toBeNull();
    expect(calls).toBe(1);
  });
  it('also backs off after network errors and malformed responses', async () => {
    for (const impl of [(async () => { throw new Error('boom'); }) as typeof fetch, (async () => new Response('not json', { status: 200 })) as typeof fetch]) {
      resetWordfenceMemo();
      let calls = 0;
      const cfg = { wordfenceApiKey: 'k', cache: store(), fetchImpl: ((...a: Parameters<typeof fetch>) => { calls++; return impl(...a); }) as typeof fetch };
      await fetchWordfence(items, cfg);
      await fetchWordfence(items, cfg);
      expect(calls).toBe(1);
    }
  });
});
