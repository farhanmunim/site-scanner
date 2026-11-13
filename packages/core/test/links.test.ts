import { describe, expect, it } from 'vitest';
import { extractLinks, parseSitemap, robotsRulesFor, robotsAllows, sampleEvenly, gatherLinks } from '../src/gather/stages/links.js';
import { isPathAllowed, RequestBudget, LIMITS } from '../src/gather/policy.js';
import { analyseLinks } from '../src/analyze/links.js';
import type { FetchedFile } from '../src/types.js';

const selfUrl = 'https://scanner.test';
const file = (body: string, status = 200): FetchedFile => ({ path: '/', status, contentType: 'text/plain', body, truncated: false });

/** Fake site: path → status. Records every request so tests can assert what was touched. */
function fakeSite(routes: Record<string, number | ((method: string) => number)>, fallback = 200) {
  const calls: { url: string; method: string }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    const r = routes[new URL(url).pathname] ?? routes[url] ?? fallback;
    const status = typeof r === 'function' ? r(method) : r;
    return new Response(method === 'HEAD' || status === 204 ? null : 'ok', { status, headers: status >= 300 && status < 400 ? { location: '/moved' } : {} });
  }) as typeof fetch;
  const preResolved = new Map([
    ['example.com', true],
    ['other.example', true]
  ]);
  return { calls, fetch: { selfUrl, budget: new RequestBudget(), target: { host: 'example.com', url: 'https://example.com/' }, fetchImpl, preResolved } };
}

const fast = { linkCheckDelayMs: 0 };
const noDns = async () => false;

describe('extractLinks', () => {
  it('resolves, de-duplicates, drops fragments and non-http schemes', () => {
    const html = `<a href="/a">A</a><a href='/a#x'>A2</a><a href=b.html>B</a><a href="mailto:x@y.z">m</a><a href="#top">t</a>
      <a href="javascript:void(0)">j</a><a class="x" href="https://other.example/p?q=1&amp;r=2">o</a><a name="no-href">n</a>`;
    expect(extractLinks(html, 'https://example.com/dir/')).toEqual(['https://example.com/a', 'https://example.com/dir/b.html', 'https://other.example/p?q=1&r=2']);
  });
  it('honours <base href>', () => {
    expect(extractLinks('<base href="https://example.com/x/"><a href="y">y</a>', 'https://example.com/')).toEqual(['https://example.com/x/y']);
  });
});

describe('parseSitemap', () => {
  it('reads urlsets and indexes', () => {
    expect(parseSitemap('<urlset><url><loc>https://example.com/a</loc></url><url><loc><![CDATA[https://example.com/b]]></loc></url></urlset>')).toEqual({ index: false, locs: ['https://example.com/a', 'https://example.com/b'] });
    expect(parseSitemap('<sitemapindex><sitemap><loc>https://example.com/s1.xml</loc></sitemap></sitemapindex>').index).toBe(true);
  });
});

describe('robots.txt rules', () => {
  const txt = `User-agent: *\nDisallow: /w/\nDisallow: /*.pdf$\nAllow: /w/ok\n\nUser-agent: GPTBot\nDisallow: /`;
  const rules = robotsRulesFor(txt);
  it('uses the * group when we have no group of our own', () => expect(rules.disallow).toEqual(['/w/', '/*.pdf$']));
  it('longest match wins, Allow wins ties', () => {
    expect(robotsAllows(rules, '/w/index.php')).toBe(false);
    expect(robotsAllows(rules, '/w/ok/page')).toBe(true);
    expect(robotsAllows(rules, '/wiki/Page')).toBe(true);
  });
  it('supports * and $', () => {
    expect(robotsAllows(rules, '/files/a.pdf')).toBe(false);
    expect(robotsAllows(rules, '/files/a.pdf.html')).toBe(true);
  });
  it('prefers a group naming us', () => {
    expect(robotsAllows(robotsRulesFor('User-agent: *\nDisallow:\n\nUser-agent: SiteScannerBot\nDisallow: /'), '/a')).toBe(false);
  });
});

describe('sampleEvenly', () => {
  it('spreads picks across the list', () => {
    expect(sampleEvenly([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([0, 3, 6, 9]);
    expect(sampleEvenly([1, 2], 5)).toEqual([1, 2]);
  });
});

describe('policy: discovered links', () => {
  const target = { host: 'example.com', url: 'https://example.com/' };
  const ctx = { discoveredLinks: new Set(['https://example.com/about', 'https://example.com/s?q=1', 'https://example.com/cart/', 'https://www.example.com/x', 'https://other.example/p']) };
  it('allows a same-host link the page listed', () => expect(isPathAllowed('https://example.com/about', target, ctx).allowed).toBe(true));
  it('refuses links the page did not list', () => expect(isPathAllowed('https://example.com/secret', target, ctx).allowed).toBe(false));
  it('refuses query strings and state-changing paths even if listed', () => {
    expect(isPathAllowed('https://example.com/s?q=1', target, ctx).allowed).toBe(false);
    expect(isPathAllowed('https://example.com/cart/', target, ctx).allowed).toBe(false);
  });
  it('refuses other hosts even if listed', () => {
    expect(isPathAllowed('https://www.example.com/x', target, ctx).allowed).toBe(false);
    expect(isPathAllowed('https://other.example/p', target, ctx).allowed).toBe(false);
  });
});

describe('gatherLinks', () => {
  it('checks every link on a small site, finds 404s, and never requests external sites', async () => {
    const site = fakeSite({ '/gone': 404, '/old-page': 410 });
    const html = `<a href="/">home</a><a href="/about">a</a><a href="/gone">g</a><a href="https://other.example/x">ext</a><a href="/s?q=1">q</a><a href="/logout">l</a>`;
    const r = await gatherLinks(
      { finalUrl: 'https://example.com/', html, robots: file('User-agent: *\nDisallow: /private/'), sitemap: file('<urlset><url><loc>https://example.com/about</loc></url><url><loc>https://example.com/old-page</loc></url><url><loc>https://example.com/private/x</loc></url></urlset>') },
      { fetch: site.fetch, limits: fast, isDeadHost: noDns }
    );
    expect(r.complete).toBe(true);
    expect(r.checked.map((c) => [c.url, c.status])).toEqual([
      ['https://example.com/about', 200],
      ['https://example.com/gone', 404],
      ['https://example.com/old-page', 410]
    ]);
    expect(r.checked[0]!.sources).toEqual(['page', 'sitemap']);
    expect(r.skipped).toEqual({ robots: 1, query: 1, unsafe: 1 });
    expect(site.calls.every((c) => new URL(c.url).hostname === 'example.com')).toBe(true);
    expect(site.calls.every((c) => c.method === 'HEAD')).toBe(true);
  });

  it('caps a large page at the link budget and samples across it', async () => {
    const site = fakeSite({});
    const html = Array.from({ length: 600 }, (_, i) => `<a href="/wiki/P${i}">p</a>`).join('');
    const r = await gatherLinks({ finalUrl: 'https://example.com/', html, robots: null, sitemap: null }, { fetch: site.fetch, limits: fast, isDeadHost: noDns });
    expect(site.calls.length).toBe(LIMITS.maxLinkChecks);
    expect(r.checked.length).toBe(LIMITS.maxLinkChecks);
    expect(r.candidates).toBe(600);
    expect(r.complete).toBe(false);
    expect(r.checked.at(-1)!.url).toBe('https://example.com/wiki/P599');
  });

  it('falls back to GET when HEAD is refused', async () => {
    const site = fakeSite({ '/nohead': (m) => (m === 'HEAD' ? 405 : 200) });
    const r = await gatherLinks({ finalUrl: 'https://example.com/', html: '<a href="/nohead">x</a>', robots: null, sitemap: null }, { fetch: site.fetch, limits: fast, isDeadHost: noDns });
    expect(r.checked[0]).toMatchObject({ status: 200, method: 'GET' });
  });

  it('stops immediately on 429 and reports the restriction', async () => {
    const site = fakeSite({ '/p1': 429 });
    const html = Array.from({ length: 10 }, (_, i) => `<a href="/p${i}">p</a>`).join('');
    const r = await gatherLinks({ finalUrl: 'https://example.com/', html, robots: null, sitemap: null }, { fetch: site.fetch, limits: { ...fast, linkCheckConcurrency: 1 }, isDeadHost: noDns });
    expect(r.restricted).toEqual({ status: 429, vendor: null });
    expect(site.calls.length).toBe(2);
    expect(r.stoppedReason).toMatch(/429/);
  });

  it('stops on 403 without marking the domain restricted', async () => {
    const site = fakeSite({ '/p0': 403 });
    const html = Array.from({ length: 5 }, (_, i) => `<a href="/p${i}">p</a>`).join('');
    const r = await gatherLinks({ finalUrl: 'https://example.com/', html, robots: null, sitemap: null }, { fetch: site.fetch, limits: { ...fast, linkCheckConcurrency: 1 }, isDeadHost: noDns });
    expect(site.calls.length).toBe(1);
    expect(r.restricted).toBeNull();
  });

  it('flags external domains that do not exist, using DNS only', async () => {
    const site = fakeSite({});
    const html = '<a href="https://expired-thing.example/a">x</a><a href="https://other.example/">y</a><a href="http://example.com/insecure">z</a>';
    const r = await gatherLinks({ finalUrl: 'https://example.com/', html, robots: null, sitemap: null }, { fetch: site.fetch, limits: fast, isDeadHost: async (h) => h === 'expired-thing.example' });
    expect(r.external.deadHosts).toEqual([{ host: 'expired-thing.example', links: ['https://expired-thing.example/a'] }]);
    expect(r.insecureLinks.total).toBe(1);
    expect(site.calls.some((c) => !c.url.startsWith('https://example.com/') && !c.url.startsWith('http://example.com/'))).toBe(false);
  });
});

describe('analyseLinks', () => {
  it('reports broken links, sitemap staleness and broken resources', async () => {
    const site = fakeSite({ '/gone': 404 });
    const links = await gatherLinks(
      { finalUrl: 'https://example.com/', html: '<a href="/ok">o</a>', robots: null, sitemap: file('<urlset><url><loc>https://example.com/gone</loc></url></urlset>') },
      { fetch: site.fetch, limits: fast, isDeadHost: noDns }
    );
    const s = analyseLinks(links, {
      requests: [
        { url: 'https://example.com/logo.png', host: 'example.com', type: 'image', status: 404, thirdParty: false },
        { url: 'https://example.com/', host: 'example.com', type: 'document', status: 200, thirdParty: false }
      ],
      blocked: null
    } as never)!;
    const byId = Object.fromEntries(s.findings.map((f) => [f.id, f]));
    expect(byId['broken-links']!.status).toBe('bad');
    expect(byId['broken-links']!.detail).toMatch(/sitemap/);
    expect(byId['broken-resources']!.status).toBe('bad');
    expect(s.coverage).toMatchObject({ checked: 2, complete: true });
  });
});
