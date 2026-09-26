import { describe, expect, it } from 'vitest';
import { fetchPsi, resourceBreakdown } from '../src/external/index.js';

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
