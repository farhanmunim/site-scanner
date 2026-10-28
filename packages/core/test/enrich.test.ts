import { describe, expect, it } from 'vitest';
import { evaluateEol, eolProductsFor, fetchEolTables, fetchGeo, fetchInternetDb, fetchOsv, fetchTranco, matchCycle } from '../src/external/enrich.js';
import { auditEol, auditExposure, mergeOsv } from '../src/analyze/exposure.js';
import { planFor } from '../src/scope.js';
import type { InternetDbData, VulnerableLibrary } from '../src/types.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const stub = (routes: Record<string, () => Response>): typeof fetch => (async (url: string | URL | Request) => {
  const u = String(url);
  const hit = Object.keys(routes).find((k) => u.includes(k));
  if (!hit) throw new Error('unexpected ' + u);
  return routes[hit]!();
}) as typeof fetch;

describe('InternetDB', () => {
  it('parses a host, treats 404 as unknown, and drops failures', async () => {
    const f = stub({ '/1.1.1.1': () => json({ ports: [443, 80, 6379], vulns: ['CVE-2020-1'], cpes: ['cpe:/a:x'], hostnames: ['a.b'], tags: [] }), '/2.2.2.2': () => new Response('', { status: 404 }), '/3.3.3.3': () => new Response('', { status: 500 }) });
    const r = await fetchInternetDb(['1.1.1.1', '2.2.2.2', '3.3.3.3'], { fetchImpl: f });
    expect(r!.hosts).toHaveLength(2);
    expect(r!.hosts[0]!.ports).toEqual([80, 443, 6379]);
    expect(r!.hosts[1]!.known).toBe(false);
    expect(await fetchInternetDb([], { fetchImpl: f })).toBeNull();
  });
  it('flags exposed databases but explains a CDN edge instead', () => {
    const db: InternetDbData = { checkedAt: '', hosts: [{ ip: '9.9.9.9', known: true, ports: [22, 80, 443, 6379], vulns: ['CVE-2021-1'], cpes: [], hostnames: [], tags: [] }] };
    const own = auditExposure(db, { sharedEdge: false, rank: null, geo: null })!;
    expect(own.findings.find((f) => f.id === 'ports-risky')!.status).toBe('bad');
    expect(own.findings.find((f) => f.id === 'ports-cves')!.status).toBe('warn');
    const edge = auditExposure(db, { sharedEdge: true, rank: null, geo: null })!;
    expect(edge.findings.map((f) => f.id)).toEqual(['ports-edge']);
  });
});

describe('endoflife.date', () => {
  const php: { cycle: string; eol: string | boolean; latest?: string }[] = [{ cycle: '8.5', eol: '2029-12-31' }, { cycle: '8.1', eol: '2025-12-31', latest: '8.1.34' }, { cycle: '5.6', eol: '2018-12-31' }];
  it('matches the longest cycle prefix', () => {
    expect(matchCycle(php, '8.1.2-1ubuntu2')?.cycle).toBe('8.1');
    expect(matchCycle([{ cycle: '1', eol: false }, { cycle: '1.2', eol: false }], '1.2.9')?.cycle).toBe('1.2');
    expect(matchCycle(php, '7.4.1')).toBeNull();
  });
  it('evaluates support and builds findings', () => {
    const items = evaluateEol([{ name: 'PHP', version: '8.1.2' }, { name: 'WordPress', version: '4.9' }], { php, wordpress: [{ cycle: '4.9', eol: true }] }, new Date('2026-06-01'));
    expect(items.map((i) => [i.product, i.supported])).toEqual([['php', false], ['wordpress', false]]);
    const f = auditEol(items, new Date('2026-06-01'));
    expect(f.map((x) => x.id)).toEqual(['eol-wordpress']); // PHP is reported by its own section
  });
  it('picks products from the page and fetches tables', async () => {
    expect(eolProductsFor('x-powered-by: Express\n<script src="jquery.js">')).toEqual(expect.arrayContaining(['php', 'jquery']));
    const t = await fetchEolTables(['php', 'nginx'], { fetchImpl: stub({ '/php.json': () => json([{ cycle: '8.4', eol: '2028-12-31', releaseDate: 'x' }]), '/nginx.json': () => new Response('', { status: 500 }) }) });
    expect(Object.keys(t!)).toEqual(['php']);
    expect(t!.php![0]).toEqual({ cycle: '8.4', eol: '2028-12-31', latest: undefined, lts: undefined });
  });
});

describe('OSV, Tranco, geo', () => {
  it('maps OSV advisories and merges them without duplicating CVEs', async () => {
    const f = stub({ 'osv.dev': () => json({ vulns: [{ id: 'GHSA-1', aliases: ['CVE-2020-11022'], summary: 'XSS', database_specific: { severity: 'MODERATE' }, affected: [{ ranges: [{ events: [{ introduced: '0' }, { fixed: '3.5.0' }] }] }] }, { id: 'GHSA-2', aliases: ['CVE-2099-1'], summary: 'New' }] }) });
    const osv = await fetchOsv([{ library: 'jquery', version: '3.4.1', source: 'a.js' }], { fetchImpl: f });
    expect(osv!['jquery@3.4.1']![0]).toMatchObject({ id: 'GHSA-1', severity: 'moderate', fixedIn: '3.5.0' });
    const existing: VulnerableLibrary[] = [{ name: 'jquery', version: '3.4.1', source: 'a.js', vulns: [{ severity: 'medium', summary: 's', cves: ['CVE-2020-11022'], below: '3.5.0', atOrAbove: null }] }];
    const merged = mergeOsv(existing, osv, [])!;
    expect(merged[0]!.vulns.map((v) => v.cves[0])).toEqual(['CVE-2020-11022', 'CVE-2099-1']);
    expect(mergeOsv(null, {}, [])).toBeNull();
  });
  it('reads rank and location', async () => {
    const f = stub({ 'tranco-list.eu': () => json({ ranks: [{ date: 'd', rank: 33 }, { date: 'd', rank: 30 }] }), 'ipwho.is': () => json({ success: true, country: 'United States', country_code: 'US', region: 'California', city: 'San Jose' }) });
    expect(await fetchTranco('github.com', { fetchImpl: f })).toEqual({ rank: 33, best: 30, days: 2 });
    expect(await fetchGeo('8.8.8.8', { fetchImpl: f })).toMatchObject({ city: 'San Jose', countryCode: 'US' });
    expect(await fetchGeo('8.8.8.8', { fetchImpl: stub({ 'ipwho.is': () => json({ success: false }) }) })).toBeNull();
  });
  it('is switchable and scoped', () => {
    expect(planFor('ports').external).toEqual(['internetDb', 'geo']);
    expect(planFor('php').external).toContain('eol');
    expect(planFor('full').external).toEqual(expect.arrayContaining(['internetDb', 'eol', 'osv', 'tranco', 'geo']));
  });
});
