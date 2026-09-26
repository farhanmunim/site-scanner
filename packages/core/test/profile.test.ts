import { describe, expect, it } from 'vitest';
import { applyProfile, profileSite } from '../src/analyze/profile.js';
import { scoreReport } from '../src/analyze/score.js';
import type { Finding, TechnologyDetection } from '../src/types.js';
import type { ParsedHtml } from '../src/analyze/html.js';

const tech = (name: string, category: string): TechnologyDetection => ({ name, slug: name.toLowerCase(), categories: [{ id: 0, name: category }], confidence: 'high', score: 100, version: null, website: null, description: null, evidence: [], implied: false });
const html = (forms: ParsedHtml['forms']) => ({ forms } as unknown as ParsedHtml);
const f = (id: string, status: Finding['status']): Finding => ({ id, title: id, status, observed: 'Header not observed.' });

describe('profileSite', () => {
  it('calls a generator-built page with no forms or cookies static', () => {
    const p = profileSite({ technologies: [tech('Astro', 'Static site generators')], html: html([]), cookies: [], xhrSameOrigin: 0, security: [] });
    expect(p.kind).toBe('static');
    expect(p.interactive).toBe(false);
    expect(p.signals).toContain('no forms on the homepage');
  });
  it('treats a login as interactive', () => {
    const p = profileSite({ technologies: [tech('React', 'JavaScript frameworks')], html: html([{ action: '/login', method: 'post', hasPassword: true }]), cookies: [], xhrSameOrigin: 0, security: [] });
    expect(p.kind).toBe('app');
    expect(p.interactive).toBe(true);
  });
  it('recognises a shop', () => {
    const p = profileSite({ technologies: [tech('Shopify', 'Ecommerce')], html: html([]), cookies: [], xhrSameOrigin: 0, security: [] });
    expect(p.kind).toBe('shop');
  });
});

describe('applyProfile', () => {
  it('downgrades browser-isolation headers on a static site and removes their penalty', () => {
    const findings = [f('csp', 'warn'), f('framing', 'warn'), f('hsts', 'warn'), f('https', 'bad')];
    const out = applyProfile(findings, { kind: 'static', interactive: false, signals: [] });
    expect(out.find((x) => x.id === 'csp')).toMatchObject({ status: 'info', relevance: 'low' });
    expect(out.find((x) => x.id === 'hsts')?.status).toBe('warn');
    expect(out.find((x) => x.id === 'https')?.status).toBe('bad');
    const s = scoreReport({ security: out, email: [], privacy: [], seo: null, performance: null });
    expect(s.sections.find((x) => x.id === 'headers')?.score).toBe(100);
    expect(s.sections.find((x) => x.id === 'tls')?.score).toBe(32);
  });
  it('leaves an interactive site untouched', () => {
    const findings = [f('csp', 'warn')];
    expect(applyProfile(findings, { kind: 'app', interactive: true, signals: [] })).toEqual(findings);
  });
});
