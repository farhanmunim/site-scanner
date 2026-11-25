import { explainFailure, scoreReport } from '@site-scanner/core/analyze';
import type { Report } from '@site-scanner/core/types';

/**
 * Scores are recomputed on every read so that scoring-rule improvements apply to reports
 * scanned earlier. scoreReport is deterministic and cheap (no I/O).
 */
export function withScores<T extends { report: unknown }>(row: T): T {
  const r = row.report as Report | null;
  if (!r || !r.security) return row;
  // A focused scan has no scores: sections it did not run would read as a perfect 100.
  if (r.scan?.scope && r.scan.scope !== 'full') return row;
  try {
    return { ...row, report: { ...r, scores: scoreReport({ security: r.security ?? [], email: r.email ?? [], privacy: r.scan?.quality === 'failed' ? [] : (r.privacy ?? []), seo: r.seo ?? null, performance: r.performance ?? null, quality: r.scan?.quality, failureReason: r.scan?.quality === 'failed' ? explainFailure(r.stages?.http?.note) : null }) } };
  } catch {
    return row;
  }
}
