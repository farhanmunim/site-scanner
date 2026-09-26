import { scoreReport } from '@site-scanner/core/analyze';
import type { Report } from '@site-scanner/core/types';

/** Reports stored before reportVersion 2 have no scores; compute them at read time. */
export function withScores<T extends { report: unknown }>(row: T): T {
  const r = row.report as Report | null;
  if (!r || r.scores) return row;
  try {
    return { ...row, report: { ...r, scores: scoreReport({ security: r.security ?? [], email: r.email ?? [], privacy: r.privacy ?? [], seo: r.seo ?? null, performance: r.performance ?? null }) } };
  } catch {
    return row;
  }
}
