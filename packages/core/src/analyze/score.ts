import type { Finding, FindingStatus, PsiMetrics, Report, ScoreSectionId, Scores, SectionScore, ScorePenalty } from '../types.js';

/**
 * Transparent, points-based scoring. Every section starts at 100 and loses a fixed
 * number of points per finding, by finding id and status. Every deduction is recorded so
 * the UI can show exactly why a number is what it is. Sections with no data score null
 * and are left out of the overall figure.
 */

const HEADER_IDS = new Set(['csp', 'xcto', 'framing', 'referrer', 'permissions', 'coop', 'cookies', 'sri', 'version-disclosure', 'login-page', 'password-form-http', 'safe-browsing', 'mixed-content']);
const TLS_IDS = new Set(['https', 'https-redirect', 'tls-cert', 'tls-expiry', 'tls-version', 'hsts']);

const DEFAULT_PENALTY: Partial<Record<FindingStatus, number>> = { bad: 25, warn: 10 };

/** Per-finding overrides: points removed for that status (missing status = default rule). */
export const PENALTY_OVERRIDES: Record<string, Partial<Record<FindingStatus, number>>> = {
  'safe-browsing': { bad: 100 },
  https: { bad: 60 },
  'tls-cert': { bad: 50 },
  'tls-expiry': { bad: 40, warn: 15 },
  'password-form-http': { bad: 40 },
  'mixed-content': { warn: 15 },
  csp: { warn: 12, info: 4 },
  hsts: { warn: 8 },
  cookies: { warn: 8 },
  referrer: { warn: 0, info: 0 },
  permissions: { warn: 0, info: 0 },
  sri: { warn: 0, info: 0 },
  'version-disclosure': { warn: 0, info: 0 },
  'login-page': { warn: 0, info: 0 },
  spf: { bad: 30, warn: 15 },
  dmarc: { warn: 15 },
  dkim: { unknown: 0 },
  title: { bad: 20, warn: 8 },
  description: { warn: 8 },
  indexable: { warn: 8 },
  h1: { warn: 8 },
  lang: { warn: 8 },
  viewport: { warn: 8 },
  'img-alt': { warn: 8 },
  'structured-data': { warn: 8 },
  'third-party-count': { warn: 15 },
  consent: { info: 10 },
  advertising: { info: 8 },
  'cookies-set': { info: 5 },
  fonts: { info: 3 }
};

export const SECTION_WEIGHTS: Record<ScoreSectionId, number> = { headers: 20, tls: 20, performance: 20, seo: 15, email: 15, privacy: 10 };
export const SECTION_LABELS: Record<ScoreSectionId, string> = {
  headers: 'Security headers',
  tls: 'HTTPS & certificate',
  performance: 'Performance',
  seo: 'SEO & meta',
  email: 'Email protection',
  privacy: 'Privacy & third parties'
};

/** Google's Core Web Vitals thresholds: [good ≤, needs-improvement ≤]; above = poor. */
export const CWV_THRESHOLDS = {
  lcpMs: [2500, 4000],
  cls: [0.1, 0.25],
  inpMs: [200, 500],
  tbtMs: [200, 600],
  ttfbMs: [800, 1800]
} as const;

export type Verdict = 'good' | 'needs-work' | 'poor';
export function cwvVerdict(metric: keyof typeof CWV_THRESHOLDS, value: number): Verdict {
  const [g, n] = CWV_THRESHOLDS[metric];
  return value <= g ? 'good' : value <= n ? 'needs-work' : 'poor';
}

export function penaltyFor(f: Pick<Finding, 'id' | 'status' | 'relevance'>): number {
  if (f.relevance === 'low') return 0;
  const o = PENALTY_OVERRIDES[f.id]?.[f.status];
  if (o !== undefined) return o;
  return DEFAULT_PENALTY[f.status] ?? 0;
}

/** Why a finding-based section could not be scored, in plain language. */
function unscoredNote(id: ScoreSectionId, findings: Finding[]): string {
  if (!findings.length) return 'Not assessed in this scan.';
  if (id === 'email' && findings.some((f) => f.id === 'mx' && /no mx/i.test(f.observed))) return 'This domain does not receive email, so there is nothing to verify.';
  if (id === 'headers' && findings.every((f) => f.relevance === 'low' || f.status === 'info')) return 'No security-header checks apply to this site.';
  if (id === 'privacy') return 'No trackers or cookies to assess.';
  return 'Nothing here could be verified.';
}

function scoreFindings(id: ScoreSectionId, findings: Finding[], exclude: ReadonlySet<string>): SectionScore {
  const base = { id, label: SECTION_LABELS[id], weight: SECTION_WEIGHTS[id] };
  // Score only what was actually verified: at least one check that passed or failed and
  // still counts. A section made entirely of "info" rows has earned nothing.
  const assessed = findings.filter((f) => !exclude.has(f.id) && f.relevance !== 'low' && (f.status === 'good' || f.status === 'warn' || f.status === 'bad'));
  if (!assessed.length) return { ...base, score: null, penalties: [], note: unscoredNote(id, findings) };
  const penalties: ScorePenalty[] = [];
  let score = 100;
  for (const f of findings) {
    if (exclude.has(f.id)) continue;
    const points = penaltyFor(f);
    if (points > 0) {
      penalties.push({ findingId: f.id, title: f.title, status: f.status, points });
      score -= points;
    }
  }
  penalties.sort((a, b) => b.points - a.points);
  return { ...base, score: Math.max(0, Math.min(100, Math.round(score))), penalties };
}

const METRIC_LABEL = { lcpMs: 'LCP', cls: 'CLS', inpMs: 'INP', tbtMs: 'TBT', ttfbMs: 'TTFB' } as const;
function fmtMetric(metric: keyof typeof CWV_THRESHOLDS, v: number): string {
  if (metric === 'cls') return v.toFixed(2);
  return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
}

/** Field (real-user) value when available, else the lab value. */
export function vitals(p: PsiMetrics): { metric: keyof typeof CWV_THRESHOLDS; value: number; source: 'field' | 'lab'; verdict: Verdict }[] {
  const out: { metric: keyof typeof CWV_THRESHOLDS; value: number; source: 'field' | 'lab'; verdict: Verdict }[] = [];
  const pick = (metric: keyof typeof CWV_THRESHOLDS, field: number | null | undefined, lab: number | null | undefined) => {
    const v = field ?? lab;
    if (v === null || v === undefined) return;
    out.push({ metric, value: v, source: field !== null && field !== undefined ? 'field' : 'lab', verdict: cwvVerdict(metric, v) });
  };
  pick('lcpMs', p.field?.lcpMs, p.lab.lcpMs);
  pick('cls', p.field?.cls, p.lab.cls);
  if (p.field?.inpMs !== null && p.field?.inpMs !== undefined) pick('inpMs', p.field.inpMs, null);
  else pick('tbtMs', null, p.lab.tbtMs);
  pick('ttfbMs', p.field?.ttfbMs, p.lab.ttfbMs ?? null);
  return out;
}

function scorePerformance(p: PsiMetrics | null): SectionScore {
  const base = { id: 'performance' as const, label: SECTION_LABELS.performance, weight: SECTION_WEIGHTS.performance };
  if (!p) return { ...base, score: null, penalties: [], note: 'Performance data not available.' };
  const vs = vitals(p);
  const points: number[] = vs.map((v) => (v.verdict === 'good' ? 100 : v.verdict === 'needs-work' ? 50 : 0));
  const cwv = points.length ? points.reduce((a, b) => a + b, 0) / points.length : null;
  const lh = p.scores.performance;
  let score: number | null;
  if (lh !== null && cwv !== null) score = Math.round(0.6 * lh + 0.4 * cwv);
  else if (lh !== null) score = lh;
  else if (cwv !== null) score = Math.round(cwv);
  else score = null;
  const penalties: ScorePenalty[] = vs
    .filter((v) => v.verdict !== 'good')
    .map((v) => ({
      findingId: v.metric,
      title: `${METRIC_LABEL[v.metric]} ${fmtMetric(v.metric, v.value)} (${v.verdict === 'poor' ? 'poor' : 'needs work'})`,
      status: v.verdict === 'poor' ? 'bad' : 'warn',
      points: v.verdict === 'poor' ? 20 : 10
    }));
  if (lh !== null && lh < 90) penalties.push({ findingId: 'lighthouse', title: `Lighthouse performance ${lh}`, status: lh < 50 ? 'bad' : 'warn', points: Math.round((100 - lh) * 0.6) });
  penalties.sort((a, b) => b.points - a.points);
  return { ...base, score: score === null ? null : Math.max(0, Math.min(100, score)), penalties, note: score === null ? 'Performance data not available.' : undefined };
}

export type ScoreInput = Pick<Report, 'security' | 'email' | 'privacy'> & { seo: { findings: Finding[] } | null; performance: PsiMetrics | null };

function sections(r: ScoreInput, exclude: ReadonlySet<string>): SectionScore[] {
  const sec = r.security ?? [];
  return [
    scoreFindings('headers', sec.filter((f) => HEADER_IDS.has(f.id) || !TLS_IDS.has(f.id)), exclude),
    scoreFindings('tls', sec.filter((f) => TLS_IDS.has(f.id)), exclude),
    scorePerformance(r.performance),
    scoreFindings('seo', r.seo?.findings ?? [], exclude),
    scoreFindings('email', r.email ?? [], exclude),
    scoreFindings('privacy', r.privacy ?? [], exclude)
  ];
}

export function overallOf(ss: SectionScore[]): number | null {
  let sum = 0;
  let w = 0;
  for (const s of ss) {
    if (s.score === null) continue;
    sum += s.score * s.weight;
    w += s.weight;
  }
  return w ? Math.round(sum / w) : null;
}

export function gradeFor(n: number | null): Scores['grade'] {
  if (n === null) return null;
  return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 70 ? 'C' : n >= 60 ? 'D' : 'F';
}

export function scoreTone(n: number | null | undefined): 'green' | 'amber' | 'red' | 'grey' {
  if (n === null || n === undefined) return 'grey';
  return n >= 80 ? 'green' : n >= 50 ? 'amber' : 'red';
}

function lower(s: string): string {
  return s.replace(/\.$/, '').replace(/^([A-Z])(?=[a-z])/, (m) => m.toLowerCase());
}

export function scoreReport(r: ScoreInput): Scores {
  const ss = sections(r, new Set());
  const overall = overallOf(ss);
  const all = ss.flatMap((s) => s.penalties.filter((p) => p.status === 'bad' || p.status === 'warn').map((p) => ({ ...p, section: s.id })));
  all.sort((a, b) => b.points - a.points);
  const bad = all.filter((p) => p.status === 'bad').length;
  const top = all.slice(0, 2);
  const notMeasured = ss.filter((s) => s.score === null);

  let summary: string;
  if (!top.length) summary = 'No findings to fix. Keep the certificate, platform and dependencies current.';
  else {
    // Performance penalties are not finding-based, so estimate the lift from finding sections only.
    const findingIds = new Set(top.filter((p) => p.section !== 'performance').map((p) => p.findingId));
    const lifted = findingIds.size ? overallOf(sections(r, findingIds)) : null;
    const names = top.map((p) => lower(p.title));
    const list = names.length === 2 ? `${names[0]} and ${names[1]}` : names[0]!;
    const lead = bad ? `${bad} critical finding${bad === 1 ? '' : 's'}.` : 'No critical findings.';
    const lift = lifted !== null && overall !== null && lifted > overall ? ` would lift this to an estimated ${lifted}.` : ' is the biggest opportunity.';
    summary = `${lead} Fixing ${list}${lift}`;
  }
  if (notMeasured.length === 1) {
    const n = notMeasured[0]!;
    summary += n.id === 'performance' ? ' Performance was not measured.' : ` ${n.label} was not scored: ${(n.note ?? 'nothing to verify').replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}.`;
  } else if (notMeasured.length > 1) summary += ` ${notMeasured.map((n) => n.label.toLowerCase()).join(', ').replace(/^./, (c) => c.toUpperCase())} were not scored.`;

  return { version: 1, overall, grade: gradeFor(overall), summary, sections: ss };
}
