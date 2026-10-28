import type { Finding, FindingStatus, Report } from '@site-scanner/core/types';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | '';

/** Only http(s) URLs may become links; anything else (javascript:, data:) is dropped. */
export const safeHref = (u: string | null | undefined): string | null => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);

export const dot = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

export const confWord = { high: 'Certain', medium: 'Likely', low: 'Possible' } as const;

export interface Rollup {
  tone: Tone;
  label: string;
  bad: number;
  warn: number;
  good: number;
}

/** One chip for a list of findings: worst status wins. Low-impact rows never count. */
export function rollup(findings: Finding[] | null | undefined, empty = 'Not assessed'): Rollup {
  const list = (findings ?? []).filter((f) => f.relevance !== 'low');
  const bad = list.filter((f) => f.status === 'bad').length;
  const warn = list.filter((f) => f.status === 'warn').length;
  const good = list.filter((f) => f.status === 'good').length;
  if (!list.length) return { tone: '', label: empty, bad, warn, good };
  if (bad) return { tone: 'bad', label: bad === 1 ? '1 failing' : `${bad} failing`, bad, warn, good };
  if (warn) return { tone: 'warn', label: warn === 1 ? '1 warning' : `${warn} warnings`, bad, warn, good };
  if (!good) return { tone: '', label: 'No issues found', bad, warn, good };
  return { tone: 'good', label: 'All good', bad, warn, good };
}

export const toneFromScore = (score: number | null | undefined): Tone => (score === null || score === undefined ? '' : score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad');

export const statusTone = (s: FindingStatus): Tone => (s === 'good' ? 'good' : s === 'warn' ? 'warn' : s === 'bad' ? 'bad' : s === 'info' ? 'info' : '');

/** Findings that need attention, worst first. */
export function issues(findings: Finding[] | null | undefined): Finding[] {
  return (findings ?? []).filter((f) => (f.status === 'bad' || f.status === 'warn') && f.relevance !== 'low').sort((a, b) => (a.status === b.status ? 0 : a.status === 'bad' ? -1 : 1));
}

export const initials = (name: string) =>
  name
    .split(/[\s.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || name.slice(0, 2).toUpperCase();

export const platformLabel = (r: Report) => (r.cms ? { wordpress: 'WordPress', shopify: 'Shopify', webflow: 'Webflow', wix: 'Wix', squarespace: 'Squarespace' }[r.cms.platform] : '');

export const TLS_IDS = new Set(['https', 'https-redirect', 'tls-cert', 'tls-chain', 'tls-expiry', 'tls-version', 'hsts']);
