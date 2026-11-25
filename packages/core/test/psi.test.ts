import { describe, expect, it } from 'vitest';
import { collectSubdomains, fetchPsi, fetchSubdomains, resourceBreakdown } from '../src/external/index.js';

const audits = {
  'largest-contentful-paint': { numericValue: 2800 },
  'cumulative-layout-shift': { numericValue: 0.08 },
  'total-blocking-time': { numericValue: 155 },
  'first-contentful-paint': { numericValue: 1800 },
  'speed-index': { numericValue: 3000 },
  interactive: { numericValue: 4000 },
  'server-response-time': { numericValue: 184 },
  'total-byte-weight': { numericValue: 1_900_000 },
  'network-requests': {
    details: {
      items: [
        { url: 'https://example.com/', resourceType: 'Document', transferSize: 20_000 },
        { url: 'https://example.com/app.js', resourceType: 'Script', transferSize: 400_000 },
        { url: 'https://cdn.example.net/lib.js', resourceType: 'Script', transferSize: 100_000 },
        { url: 'https://example.com/hero.jpg', resourceType: 'Image', transferSize: 1_200_000 }
      ]
    }
  },
  'resource-summary': {
    details: {
      items: [
        { resourceType: 'total', transferSize: 1_900_000 },
        { resourceType: 'script', transferSize: 412_000 },
        { resourceType: 'image', transferSize: 1_200_000 },
        { resourceType: 'font', transferSize: 96_000 },
        { resourceType: 'stylesheet', transferSize: 118_000 },
        { resourceType: 'document', transferSize: 20_000 },
        { resourceType: 'media', transferSize: 4_000 },
        { resourceType: 'third-party', transferSize: 342_000 }
      ]
    }
  }
};

const response = (a: Record<string, unknown>) => ({
  lighthouseResult: { lighthouseVersion: '12.0.0', finalDisplayedUrl: 'https://example.com/', categories: { performance: { score: 0.7, auditRefs: [] }, accessibility: { score: 0.9, auditRefs: [] } }, audits: a },
  loadingExperience: { overall_category: 'AVERAGE', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2800 }, INTERACTION_TO_NEXT_PAINT: { percentile: 210 } } }
});

describe('fetchPsi', () => {
  it('parses TTFB and the resource breakdown', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(response(audits)), { status: 200 })) as unknown as typeof fetch;
    const m = await fetchPsi('https://example.com/', 'mobile', { googleApiKey: 'k', fetchImpl });
    expect(m?.lab.ttfbMs).toBe(184);
    expect(m?.scores.performance).toBe(70);
    expect(m?.breakdown).toEqual({ scriptBytes: 412_000, imageBytes: 1_200_000, fontBytes: 96_000, stylesheetBytes: 118_000, documentBytes: 20_000, thirdPartyBytes: 342_000, otherBytes: 4_000 });
    expect(m?.field?.inpMs).toBe(210);
  });

  it('derives the breakdown from network-requests when resource-summary is absent', () => {
    const { 'resource-summary': _drop, ...rest } = audits;
    const b = resourceBreakdown(rest as never, 'https://example.com/');
    expect(b?.scriptBytes).toBe(500_000);
    expect(b?.imageBytes).toBe(1_200_000);
    expect(b?.documentBytes).toBe(20_000);
    expect(b?.thirdPartyBytes).toBe(100_000);
  });

  it('returns null without an API key', async () => {
    expect(await fetchPsi('https://example.com/', 'mobile', {})).toBeNull();
  });
});

describe('collectSubdomains', () => {
  it('dedupes, strips wildcards and keeps only names under the domain', () => {
    const r = collectSubdomains(['www.example.com\nexample.com', '*.example.com', 'api.example.com\nAPI.example.com', 'example.com.evil.net', 'shop.example.com', 'deep.api.example.com'], 'example.com');
    expect(r.names).toEqual(['api.example.com', 'shop.example.com', 'www.example.com', 'deep.api.example.com']);
    expect(r.total).toBe(4);
  });
});

describe('fetchSubdomains', () => {
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  it('uses crt.sh when it answers', async () => {
    const fetchImpl = (async () => json([{ name_value: 'a.example.com\n*.example.com' }])) as unknown as typeof fetch;
    const r = await fetchSubdomains('example.com', { fetchImpl });
    expect(r).toMatchObject({ source: 'ct-log', names: ['a.example.com'], total: 1 });
  });
  it('retries crt.sh, then falls back to Certspotter when it keeps failing', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (u: string) => {
      calls.push(new URL(u).hostname);
      return u.includes('crt.sh') ? new Response('bad gateway', { status: 502 }) : json([{ dns_names: ['www.example.com', 'mail.example.com'] }]);
    }) as unknown as typeof fetch;
    const r = await fetchSubdomains('example.com', { fetchImpl });
    expect(calls.filter((c) => c === 'crt.sh')).toHaveLength(2);
    expect(r).toMatchObject({ source: 'certspotter', total: 2 });
  }, 15_000);
  it('falls back to HackerTarget and rejects its error text', async () => {
    const fetchImpl = (async (u: string) => (u.includes('hackertarget') ? new Response('www.example.com,1.2.3.4\nm.example.com,1.2.3.5') : new Response('nope', { status: 429 }))) as unknown as typeof fetch;
    expect(await fetchSubdomains('example.com', { fetchImpl })).toMatchObject({ source: 'hackertarget', total: 2 });
    const limited = (async (u: string) => (u.includes('hackertarget') ? new Response('API count exceeded - Increase Quota') : new Response('nope', { status: 429 }))) as unknown as typeof fetch;
    expect(await fetchSubdomains('example.com', { fetchImpl: limited })).toBeNull();
  }, 15_000);
  it('separates names that still resolve from retired ones', async () => {
    const fetchImpl = (async () => json([{ name_value: 'www.example.com\nold.example.com\nslow.example.com' }])) as unknown as typeof fetch;
    const resolveName = async (n: string) => (n === 'www.example.com' ? true : n === 'slow.example.com' ? null : false);
    const r = await fetchSubdomains('example.com', { fetchImpl, resolveName });
    expect(r).toMatchObject({ total: 3, live: ['www.example.com'], unverified: 1 });
    expect(r?.wildcard).toBeUndefined();
  });
  it('does not filter when the domain has a wildcard record', async () => {
    const fetchImpl = (async () => json([{ name_value: 'a.example.com\nb.example.com' }])) as unknown as typeof fetch;
    const r = await fetchSubdomains('example.com', { fetchImpl, resolveName: async () => true });
    expect(r).toMatchObject({ wildcard: true, total: 2 });
    expect(r?.live).toBeUndefined();
  });
  it('is null when disabled', async () => {
    expect(await fetchSubdomains('example.com', { subdomains: false })).toBeNull();
  });
});
