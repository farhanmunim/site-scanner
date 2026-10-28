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

import { fetchCrux, parseCrux } from '../src/external/enrich.js';
describe('Chrome UX Report history', () => {
  const body = { record: { collectionPeriods: [{ lastDate: { year: 2026, month: 9, day: 5 } }, { lastDate: { year: 2026, month: 9, day: 12 } }, { lastDate: { year: 2026, month: 9, day: 19 } }], metrics: { largest_contentful_paint: { percentilesTimeseries: { p75s: [2400, 2300, 2100] } }, interaction_to_next_paint: { percentilesTimeseries: { p75s: [180, null, 170] } }, cumulative_layout_shift: { percentilesTimeseries: { p75s: ['0.05', '0.06', '0.04'] } } } } };
  it('zips the parallel arrays and reads string CLS values', () => {
    const h = parseCrux('https://a.test', body)!;
    expect(h.periods).toHaveLength(3);
    expect(h.periods[0]).toEqual({ end: '2026-09-05', lcpMs: 2400, inpMs: 180, cls: 0.05, ttfbMs: null });
    expect(h.periods[1]!.inpMs).toBeNull();
    expect(parseCrux('https://a.test', { record: { collectionPeriods: [], metrics: {} } })).toBeNull();
  });
  it('needs the key, treats 404 as no data, and sends the origin', async () => {
    let sent: { url: string; body: string } | null = null;
    const f = (async (u: string, init: RequestInit) => ((sent = { url: u, body: String(init.body) }), new Response(JSON.stringify(body)))) as unknown as typeof fetch;
    expect(await fetchCrux('https://a.test/page?x=1', { fetchImpl: f })).toBeNull();
    const h = await fetchCrux('https://a.test/page?x=1', { googleApiKey: 'K', fetchImpl: f });
    expect(h!.origin).toBe('https://a.test');
    expect(JSON.parse(sent!.body)).toMatchObject({ origin: 'https://a.test', formFactor: 'PHONE' });
    expect(await fetchCrux('https://b.test/', { googleApiKey: 'K', fetchImpl: (async () => new Response('', { status: 404 })) as typeof fetch })).toBeNull();
  });
});

import { fetchAbuseIpdb, fetchOtx, fetchReputation, fetchUrlhaus, fetchVirusTotal } from '../src/external/reputation.js';
import { auditReputation } from '../src/analyze/exposure.js';
import type { IpInfo } from '../src/types.js';

const mem = () => {
  const m = new Map<string, unknown>();
  return { get: async (k: string) => m.get(k) as never, set: async (k: string, v: unknown) => void m.set(k, v) };
};
const ip = (addr: string, org: string): IpInfo => ({ ip: addr, version: 4, asn: 1, asnOrg: org, country: 'US', prefix: null, reverseDns: null });

describe('threat intelligence', () => {
  it('does nothing without keys', async () => {
    expect(await fetchReputation('a.test', [], {})).toBeNull();
    expect(await fetchVirusTotal('a.test', {})).toBeNull();
  });
  it('VirusTotal: sends the key, parses stats, caches, and pauses after a 429', async () => {
    let calls = 0;
    let header: string | undefined;
    const f = (async (_u: string, init: RequestInit) => ((calls++, (header = (init.headers as Record<string, string>)['x-apikey'])), json({ data: { attributes: { last_analysis_stats: { malicious: 3, suspicious: 1, harmless: 60, undetected: 20 }, reputation: -5, categories: { a: 'phishing', b: 'phishing' } } } }))) as unknown as typeof fetch;
    const cache = mem();
    const v = await fetchVirusTotal('bad.test', { virustotalKey: 'K', fetchImpl: f, cache });
    expect(v).toMatchObject({ malicious: 3, engines: 84, reputation: -5, categories: ['phishing'] });
    expect(header).toBe('K');
    await fetchVirusTotal('bad.test', { virustotalKey: 'K', fetchImpl: f, cache });
    expect(calls).toBe(1);
    const limited = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    const c2 = mem();
    expect(await fetchVirusTotal('x.test', { virustotalKey: 'K', fetchImpl: limited, cache: c2 })).toBeNull();
    let again = 0;
    await fetchVirusTotal('y.test', { virustotalKey: 'K', fetchImpl: (async () => (again++, json({}))) as unknown as typeof fetch, cache: c2 });
    expect(again).toBe(0); // paused
  });
  it('AbuseIPDB skips CDN addresses and parses the score', async () => {
    const f = stub({ 'abuseipdb.com': () => json({ data: { abuseConfidenceScore: 80, totalReports: 12, lastReportedAt: '2026-10-01', usageType: 'Data Center', isp: 'Host Co' } }) });
    expect(await fetchAbuseIpdb([ip('1.1.1.1', 'Cloudflare, Inc.')], { abuseipdbKey: 'K', fetchImpl: f })).toEqual([]);
    const r = await fetchAbuseIpdb([ip('9.9.9.9', 'Host Co')], { abuseipdbKey: 'K', fetchImpl: f });
    expect(r![0]).toMatchObject({ ip: '9.9.9.9', score: 80, reports: 12 });
  });
  it('OTX and URLhaus parse and send their auth headers', async () => {
    let otxHdr = '';
    let hausHdr = '';
    let hausBody = '';
    const f = (async (u: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      if (u.includes('otx')) return (otxHdr = h['X-OTX-API-KEY']!), json({ pulse_info: { count: 7, pulses: [{ name: 'Phishing kit' }] } });
      return (hausHdr = h['Auth-Key']!), (hausBody = String(init.body)), json({ query_status: 'ok', urls_online: '2', url_count: '9', blacklists: { spamhaus_dbl: 'listed', surbl: 'not listed' } });
    }) as unknown as typeof fetch;
    expect(await fetchOtx('a.test', { otxKey: 'O', fetchImpl: f })).toEqual({ pulses: 7, names: ['Phishing kit'] });
    expect(otxHdr).toBe('O');
    expect(await fetchUrlhaus('a.test', { urlhausKey: 'U', fetchImpl: f })).toEqual({ listed: true, urlsOnline: 2, urlCount: 9, blacklists: ['spamhaus_dbl: listed'] });
    expect(hausHdr).toBe('U');
    expect(hausBody).toBe('host=a.test');
    const none = (async () => json({ query_status: 'no_results' })) as unknown as typeof fetch;
    expect((await fetchUrlhaus('clean.test', { urlhausKey: 'U', fetchImpl: none }))!.listed).toBe(false);
  });
  it('turns the answers into measured findings', () => {
    const f = auditReputation({ checkedAt: '', asked: ['virustotal', 'urlhaus', 'otx', 'abuseipdb'], virustotal: { malicious: 1, suspicious: 0, harmless: 70, undetected: 10, engines: 81, reputation: 0, categories: [] }, urlhaus: { listed: true, urlsOnline: 0, urlCount: 3, blacklists: [] }, otx: { pulses: 12, names: ['x'] }, abuseipdb: [{ ip: '9.9.9.9', score: 5, reports: 1, lastReportedAt: null, usageType: null, isp: null }] });
    expect(Object.fromEntries(f.map((x) => [x.id, x.status]))).toEqual({ 'rep-urlhaus': 'warn', 'rep-virustotal': 'warn', 'rep-abuseipdb': 'good', 'rep-otx': 'warn' });
    const bad = auditReputation({ checkedAt: '', asked: ['virustotal', 'urlhaus'], virustotal: { malicious: 5, suspicious: 0, harmless: 60, undetected: 10, engines: 75, reputation: -9, categories: [] }, urlhaus: { listed: true, urlsOnline: 2, urlCount: 4, blacklists: [] } });
    expect(bad.map((x) => x.status)).toEqual(['bad', 'bad']);
    const unavailable = auditReputation({ checkedAt: '', asked: ['virustotal'], virustotal: null });
    expect(unavailable[0]!.status).toBe('unknown');
  });
});
