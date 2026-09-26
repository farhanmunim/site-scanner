import { describe, expect, it } from 'vitest';
import { cwvVerdict, gradeFor, scoreReport, scoreTone } from '../src/analyze/score.js';
import type { Finding, PsiMetrics } from '../src/types.js';

const f = (id: string, status: Finding['status'], title = id): Finding => ({ id, title, status, observed: '' });

const goodSecurity = [f('https', 'good'), f('hsts', 'good'), f('csp', 'good'), f('xcto', 'good'), f('framing', 'good'), f('tls-cert', 'good')];
const goodEmail = [f('spf', 'good'), f('dmarc', 'good'), f('dkim', 'good')];
const goodSeo = { findings: [f('title', 'good'), f('description', 'good')] };
const goodPrivacy = [f('analytics', 'good'), f('advertising', 'good')];

const psi = (over: Partial<PsiMetrics> = {}): PsiMetrics => ({
  strategy: 'mobile',
  fetchedAt: '2026-01-01T00:00:00Z',
  lighthouseVersion: null,
  scores: { performance: 100, accessibility: 100, bestPractices: 100, seo: 100 },
  lab: { lcpMs: 1200, cls: 0.01, tbtMs: 50, fcpMs: 900, speedIndexMs: 1500, ttiMs: 2000, ttfbMs: 300 },
  field: null,
  screenshotDataUrl: null,
  accessibilityIssues: [],
  totalBytes: 1000,
  requestCount: 10,
  ...over
});

describe('scoreReport', () => {
  it('scores a clean site 100 / A', () => {
    const s = scoreReport({ security: goodSecurity, email: goodEmail, seo: goodSeo, privacy: goodPrivacy, performance: psi() });
    expect(s.sections.map((x) => x.score)).toEqual([100, 100, 100, 100, 100, 100]);
    expect(s.overall).toBe(100);
    expect(s.grade).toBe('A');
    expect(s.summary).toMatch(/No findings to fix/);
  });

  it('applies per-finding penalties and records them', () => {
    const security = [f('https', 'bad', 'Uses HTTPS'), f('csp', 'warn', 'Script protection (CSP)'), f('xcto', 'good')];
    const s = scoreReport({ security, email: goodEmail, seo: goodSeo, privacy: goodPrivacy, performance: psi() });
    const tls = s.sections.find((x) => x.id === 'tls')!;
    const headers = s.sections.find((x) => x.id === 'headers')!;
    expect(tls.score).toBe(40);
    expect(headers.score).toBe(88);
    expect(tls.penalties[0]).toMatchObject({ findingId: 'https', points: 60 });
    expect(s.summary).toMatch(/1 critical finding\. Fixing uses HTTPS and script protection \(CSP\) would lift this to an estimated 100\./);
  });

  it('excludes unmeasured sections from the overall', () => {
    const s = scoreReport({ security: goodSecurity, email: [], seo: null, privacy: goodPrivacy, performance: null });
    expect(s.sections.find((x) => x.id === 'performance')!.score).toBeNull();
    expect(s.sections.find((x) => x.id === 'email')!.score).toBeNull();
    expect(s.overall).toBe(100);
    expect(s.summary).toMatch(/were not scored/);
  });

  it('does not score a section where nothing could be verified', () => {
    const email = [{ id: 'mx', title: 'Receives email', status: 'info', observed: 'No MX records. The domain does not appear to receive email.' } as Finding, f('spf', 'info'), f('dmarc', 'info'), f('dkim', 'unknown')];
    const s = scoreReport({ security: goodSecurity, email, seo: goodSeo, privacy: goodPrivacy, performance: psi() });
    const e = s.sections.find((x) => x.id === 'email')!;
    expect(e.score).toBeNull();
    expect(e.note).toMatch(/does not receive email/);
    expect(s.overall).toBe(100);
    expect(s.summary).toMatch(/Email protection was not scored: this domain does not receive email/);
  });

  it('does not score security headers when every check is low impact', () => {
    const security = [{ ...f('csp', 'info'), relevance: 'low' as const }, { ...f('framing', 'info'), relevance: 'low' as const }, f('permissions', 'info')];
    const s = scoreReport({ security, email: goodEmail, seo: goodSeo, privacy: goodPrivacy, performance: psi() });
    expect(s.sections.find((x) => x.id === 'headers')!.score).toBeNull();
    expect(s.sections.find((x) => x.id === 'headers')!.note).toMatch(/No security-header checks apply/);
  });

  it('blends Lighthouse with Core Web Vitals, preferring field data', () => {
    const p = psi({ scores: { performance: 70, accessibility: 90, bestPractices: 90, seo: 90 }, field: { lcpMs: 2800, cls: 0.08, inpMs: 210, ttfbMs: 184, overall: 'AVERAGE' } });
    const s = scoreReport({ security: goodSecurity, email: goodEmail, seo: goodSeo, privacy: goodPrivacy, performance: p });
    // cwv = (50 + 100 + 50 + 100) / 4 = 75 → 0.6 * 70 + 0.4 * 75 = 72
    expect(s.sections.find((x) => x.id === 'performance')!.score).toBe(72);
  });

  it('clamps at zero', () => {
    const s = scoreReport({ security: [f('safe-browsing', 'bad'), f('csp', 'bad')], email: goodEmail, seo: goodSeo, privacy: goodPrivacy, performance: psi() });
    expect(s.sections.find((x) => x.id === 'headers')!.score).toBe(0);
  });

  it('is deterministic', () => {
    const input = { security: goodSecurity, email: goodEmail, seo: goodSeo, privacy: goodPrivacy, performance: psi() };
    expect(scoreReport(input)).toEqual(scoreReport(input));
  });
});

describe('grades and tones', () => {
  it('maps grade boundaries', () => {
    expect([100, 90, 89, 80, 79, 70, 69, 60, 59, 0].map(gradeFor)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'F', 'F']);
    expect(gradeFor(null)).toBeNull();
  });
  it('maps tones', () => {
    expect([80, 79, 50, 49].map(scoreTone)).toEqual(['green', 'amber', 'amber', 'red']);
    expect(scoreTone(null)).toBe('grey');
  });
  it('judges vitals against Google thresholds', () => {
    expect(cwvVerdict('lcpMs', 2500)).toBe('good');
    expect(cwvVerdict('lcpMs', 2501)).toBe('needs-work');
    expect(cwvVerdict('lcpMs', 4001)).toBe('poor');
    expect(cwvVerdict('cls', 0.3)).toBe('poor');
  });
});
