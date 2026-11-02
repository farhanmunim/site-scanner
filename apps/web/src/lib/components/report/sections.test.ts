import { describe, expect, it } from 'vitest';
import type { Report, Scores } from '@site-scanner/core/types';
import { FULL_SECTIONS, sidebarValue, worthShowing } from './sections';

const report = (over: Partial<Report> = {}) => ({ domainChecks: [], email: [], security: [], privacy: [], ...over }) as unknown as Report;
const scores = (sections: { id: string; score: number | null }[]) => ({ sections }) as unknown as Scores;

describe('worthShowing', () => {
  it('shows everything while there is no report yet', () => {
    for (const id of FULL_SECTIONS) expect(worthShowing(id, null)).toBe(true);
  });
  it('hides PHP, platform, ports and reputation when there is nothing to say', () => {
    const r = report();
    for (const id of ['php', 'wordpress', 'ports', 'reputation'] as const) expect(worthShowing(id, r), id).toBe(false);
    expect(worthShowing('domain', r)).toBe(true);
  });
  it('shows them when there is data', () => {
    expect(worthShowing('php', report({ php: { detected: true } as never }))).toBe(true);
    expect(worthShowing('wordpress', report({ platform: { name: 'Wix' } as never }))).toBe(true);
    expect(worthShowing('wordpress', report({ cms: { platform: 'wordpress' } as never }))).toBe(true);
    expect(worthShowing('ports', report({ exposure: { hosts: [] } as never }))).toBe(true);
  });
});

describe('sidebarValue', () => {
  it('shows scores once finished, nothing while running', () => {
    const ctx = { report: report(), scores: scores([{ id: 'headers', score: 92 }]), running: false };
    expect(sidebarValue('headers', ctx)).toEqual({ sc: '92', tone: 'good' });
    expect(sidebarValue('headers', { ...ctx, running: true })).toEqual({ sc: '', tone: '' });
    expect(sidebarValue('seo', ctx)).toEqual({ sc: '', tone: '' });
  });
  it('counts SPF lookups against the limit of 10', () => {
    const at = (n: number) => sidebarValue('spf', { report: report({ dns: { spf: { totalLookups: n } } as never }), scores: null, running: false });
    expect(at(3)).toEqual({ sc: '3/10', tone: 'good' });
    expect(at(9).tone).toBe('warn');
    expect(at(11).tone).toBe('bad');
  });
  it('summarises libraries, blocklists and PHP', () => {
    const ctx = (r: Partial<Report>) => ({ report: report(r), scores: null, running: false });
    expect(sidebarValue('libraries', ctx({ vulnerableLibraries: [], exposedSecrets: [] }))).toEqual({ sc: '✓', tone: 'good' });
    expect(sidebarValue('libraries', ctx({ vulnerableLibraries: [{}] as never, exposedSecrets: [{}, {}] as never }))).toEqual({ sc: '3', tone: 'bad' });
    expect(sidebarValue('libraries', ctx({ vulnerableLibraries: null }))).toEqual({ sc: '', tone: '' });
    expect(sidebarValue('blocklist', ctx({ blocklists: { listed: [{}] } as never }))).toEqual({ sc: '1', tone: 'bad' });
    expect(sidebarValue('php', ctx({ php: { detected: true, version: '7.4.1', supported: false } as never }))).toEqual({ sc: '7.4.1', tone: 'bad' });
    expect(sidebarValue('php', ctx({ php: { detected: false } as never }))).toEqual({ sc: '', tone: '' });
  });
  it('counts warnings and failures in finding lists', () => {
    const f = (status: string) => ({ id: status, title: status, status, observed: '' });
    const r = report({ reputation: { findings: [f('good'), f('warn'), f('bad')] } as never });
    expect(sidebarValue('reputation', { report: r, scores: null, running: false })).toMatchObject({ sc: '2', tone: 'bad' });
    const clean = report({ reputation: { findings: [f('good')] } as never });
    expect(sidebarValue('reputation', { report: clean, scores: null, running: false })).toMatchObject({ sc: '✓', tone: 'good' });
  });
});
