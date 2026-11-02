/** Shared basics: versions, confidence levels and the scan stages. */

export const SCANNER_VERSION = '0.1.0';
export const REPORT_VERSION = 2;

export type Confidence = 'high' | 'medium' | 'low';

export type StageName = 'dns' | 'http' | 'files' | 'rdap' | 'cert' | 'browser' | 'external';
export const STAGE_ORDER: StageName[] = ['dns', 'http', 'files', 'rdap', 'cert', 'browser', 'external'];

/** Outcome of a single gather stage. "restricted" = target blocked us; never retried. */
export type StageStatus = 'pending' | 'complete' | 'restricted' | 'failed' | 'skipped';

export interface StageMeta {
  status: StageStatus;
  startedAt?: string;
  durationMs?: number;
  /** Human-readable reason for restricted/failed/skipped. */
  note?: string;
}
