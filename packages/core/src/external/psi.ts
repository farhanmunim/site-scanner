/** Google PageSpeed Insights (Lighthouse + real-user data). */
import { parse as parseDomain } from 'tldts';
import { cached } from './cache.js';
import type { ExternalConfig } from './config.js';
import type { PsiMetrics } from '../types.js';

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export async function fetchPsi(url: string, strategy: 'mobile' | 'desktop', cfg: ExternalConfig): Promise<PsiMetrics | null> {
  if (!cfg.googleApiKey || cfg.psi === false) return null;
  return cached(cfg, `psi2:${strategy}:${url}`, 6 * 3600, async () => {
    const f = cfg.fetchImpl ?? fetch;
    const u = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    u.searchParams.set('url', url);
    u.searchParams.set('strategy', strategy);
    for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) u.searchParams.append('category', c);
    u.searchParams.set('key', cfg.googleApiKey!);
    const res = await f(u.toString(), { signal: AbortSignal.timeout(75_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as PsiResponse;
    const lh = j.lighthouseResult;
    if (!lh) return null;
    const a = lh.audits ?? {};
    const cat = lh.categories ?? {};
    const score = (k: string) => (num(cat[k]?.score) !== null ? Math.round(cat[k]!.score! * 100) : null);
    const ms = (k: string) => num(a[k]?.numericValue);
    const fieldM = j.loadingExperience?.metrics;
    const field = fieldM
      ? {
          lcpMs: num(fieldM.LARGEST_CONTENTFUL_PAINT_MS?.percentile),
          cls: fieldM.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile !== undefined ? fieldM.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
          inpMs: num(fieldM.INTERACTION_TO_NEXT_PAINT?.percentile),
          ttfbMs: num(fieldM.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile),
          overall: j.loadingExperience?.overall_category ?? null
        }
      : null;
    const a11y = Object.values(a)
      .filter((x) => x && x.score !== null && x.score !== undefined && x.score < 1 && x.id && (lh.categories?.accessibility?.auditRefs ?? []).some((r) => r.id === x.id))
      .map((x) => ({ id: x.id!, title: x.title ?? x.id!, count: x.details?.items?.length ?? 1 }))
      .slice(0, 15);
    return {
      strategy,
      fetchedAt: new Date().toISOString(),
      lighthouseVersion: lh.lighthouseVersion ?? null,
      scores: { performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo') },
      lab: { lcpMs: ms('largest-contentful-paint'), cls: ms('cumulative-layout-shift'), tbtMs: ms('total-blocking-time'), fcpMs: ms('first-contentful-paint'), speedIndexMs: ms('speed-index'), ttiMs: ms('interactive'), ttfbMs: ms('server-response-time') },
      field,
      screenshotDataUrl: a['final-screenshot']?.details?.data ?? null,
      accessibilityIssues: a11y,
      totalBytes: num(a['total-byte-weight']?.numericValue),
      requestCount: a['network-requests']?.details?.items?.length ?? null,
      breakdown: resourceBreakdown(a, lh.finalDisplayedUrl ?? lh.finalUrl ?? url)
    };
  });
}

type ResItem = { resourceType?: string; transferSize?: number; url?: string };

/** Bytes by resource type from Lighthouse's resource-summary, else derived from network-requests. */
export function resourceBreakdown(a: NonNullable<NonNullable<PsiResponse['lighthouseResult']>['audits']>, finalUrl: string): PsiMetrics['breakdown'] {
  const out = { scriptBytes: null, imageBytes: null, fontBytes: null, stylesheetBytes: null, documentBytes: null, thirdPartyBytes: null, otherBytes: null } as NonNullable<PsiMetrics['breakdown']>;
  const key = (t: string | undefined): keyof typeof out | null => {
    switch ((t ?? '').toLowerCase()) {
      case 'script':
        return 'scriptBytes';
      case 'image':
        return 'imageBytes';
      case 'font':
        return 'fontBytes';
      case 'stylesheet':
        return 'stylesheetBytes';
      case 'document':
        return 'documentBytes';
      case 'third-party':
        return 'thirdPartyBytes';
      case 'total':
        return null;
      default:
        return 'otherBytes';
    }
  };
  const summary = a['resource-summary']?.details?.items as ResItem[] | undefined;
  if (summary?.length) {
    for (const it of summary) {
      const k = key(it.resourceType);
      if (!k || typeof it.transferSize !== 'number') continue;
      out[k] = (out[k] ?? 0) + it.transferSize;
    }
    return out;
  }
  const reqs = a['network-requests']?.details?.items as ResItem[] | undefined;
  if (!reqs?.length) return null;
  const own = parseDomain(finalUrl).domain;
  let third = 0;
  for (const it of reqs) {
    if (typeof it.transferSize !== 'number') continue;
    const k = key(it.resourceType) ?? 'otherBytes';
    if (k !== 'thirdPartyBytes') out[k] = (out[k] ?? 0) + it.transferSize;
    if (it.url && own && parseDomain(it.url).domain !== own) third += it.transferSize;
  }
  out.thirdPartyBytes = third;
  return out;
}

export interface PsiResponse {
  lighthouseResult?: {
    lighthouseVersion?: string;
    finalDisplayedUrl?: string;
    finalUrl?: string;
    categories?: Record<string, { score?: number | null; auditRefs?: { id: string }[] }>;
    audits?: Record<string, { id?: string; title?: string; score?: number | null; numericValue?: number; details?: { data?: string; items?: unknown[] } }>;
  };
  loadingExperience?: { overall_category?: string; metrics?: Record<string, { percentile: number }> };
}
