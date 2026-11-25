import type { Report, Scores } from '@site-scanner/core/types';
import type { SectionId } from '$lib/data/tools';
import { rollup, toneFromScore, type Tone } from './helpers';

/** The sections of a full report, in the order they appear. A focused tool shows only its own (see data/tools.ts). */
export const FULL_SECTIONS: SectionId[] = ['fixes', 'page', 'domain', 'email', 'spf', 'blocklist', 'reputation', 'headers', 'tls', 'seo', 'performance', 'ai', 'stack', 'php', 'wordpress', 'libraries', 'dns', 'ports', 'subdomains', 'privacy'];

/**
 * In the full report, skip sections that have nothing to say (no PHP, no recognised platform, no port data).
 * A focused tool always shows its section, so "PHP version checker" can still answer "not detected".
 */
export function worthShowing(id: SectionId, report: Report | null): boolean {
  if (!report) return true;
  if (id === 'php') return !!report.php?.detected;
  if (id === 'wordpress') return !!report.cms || !!report.platform;
  if (id === 'ports') return !!report.exposure;
  if (id === 'reputation') return !!report.reputation;
  return true;
}

export interface SidebarContext {
  report: Report;
  scores: Scores | null;
  running: boolean;
}

const blank = { sc: '', tone: '' as Tone };

/** The little score or status shown next to a section in the sidebar ("92", "3", "✓", or nothing). */
export function sidebarValue(id: SectionId, { report, scores, running }: SidebarContext): { sc: string; tone: Tone } {
  const sec = (key: string) => scores?.sections.find((s) => s.id === key)?.score ?? null;
  const num = (n: number | null) => (n === null || running ? blank : { sc: String(n), tone: toneFromScore(n) });
  const issues = (findings: Parameters<typeof rollup>[0]) => {
    const r = rollup(findings);
    return { sc: r.bad + r.warn ? String(r.bad + r.warn) : '✓', tone: r.tone };
  };
  switch (id) {
    case 'headers': return num(sec('headers'));
    case 'tls': return num(sec('tls'));
    case 'seo': return num(sec('seo'));
    case 'email': return num(sec('email'));
    case 'performance': return num(sec('performance'));
    case 'privacy': return num(sec('privacy'));
    case 'ai': return num(report.aiReadiness?.score ?? null);
    case 'domain': {
      const r = rollup(report.domainChecks);
      return { sc: r.tone === 'good' ? '✓' : r.bad + r.warn ? String(r.bad + r.warn) : '', tone: r.tone };
    }
    case 'blocklist': {
      const b = report.blocklists;
      return b ? { sc: b.listed.length ? String(b.listed.length) : '✓', tone: b.listed.length ? 'bad' : 'good' } : blank;
    }
    case 'spf': {
      const s = report.dns?.spf;
      return s ? { sc: `${s.totalLookups}/10`, tone: s.totalLookups > 10 ? 'bad' : s.totalLookups >= 9 ? 'warn' : 'good' } : blank;
    }
    case 'libraries': {
      const n = (report.vulnerableLibraries?.length ?? 0) + (report.exposedSecrets?.length ?? 0);
      return report.vulnerableLibraries == null ? blank : { sc: n ? String(n) : '✓', tone: n ? 'bad' : 'good' };
    }
    case 'page': {
      const n = report.social?.notes.length ?? 0;
      return report.social ? { sc: n ? String(n) : '✓', tone: n > 2 ? 'warn' : n ? '' : 'good' } : blank;
    }
    case 'reputation': return report.reputation ? issues(report.reputation.findings) : blank;
    case 'ports': return report.exposure?.hosts.some((h) => h.known) ? issues(report.exposure.findings) : blank;
    case 'php': {
      const p = report.php;
      return p?.detected ? { sc: p.version ?? '?', tone: p.supported === false ? 'bad' : p.supported ? 'good' : '' } : blank;
    }
    case 'wordpress': return report.cms ? issues(report.cms.flags) : blank;
    default: return blank;
  }
}
