import type { StageName } from './types.js';
import { STAGE_ORDER } from './types.js';

/**
 * What a scan has to do. A focused tool only needs some stages and some of the external lookups;
 * running the rest wastes time (PageSpeed alone is 15-60 s) and requests against the target.
 */
export type ExternalCheck = 'psi' | 'safeBrowsing' | 'wayback' | 'greenWeb' | 'subdomains' | 'wordpress' | 'retire' | 'blocklists' | 'propagation' | 'internetDb' | 'eol' | 'osv' | 'tranco' | 'geo' | 'crux';

export interface ScopePlan {
  /** Stages that run. `files` and `browser` pull in `http`. */
  stages: StageName[];
  external: ExternalCheck[];
}

const ALL_EXTERNAL: ExternalCheck[] = ['psi', 'safeBrowsing', 'wayback', 'greenWeb', 'subdomains', 'wordpress', 'retire', 'blocklists', 'propagation', 'internetDb', 'eol', 'osv', 'tranco', 'geo', 'crux'];

const RAW: Record<string, ScopePlan> = {
  full: { stages: [...STAGE_ORDER], external: ALL_EXTERNAL },
  domain: { stages: ['dns', 'rdap', 'cert'], external: ['wayback', 'tranco'] },
  ports: { stages: ['dns'], external: ['internetDb', 'geo'] },
  email: { stages: ['dns'], external: ['blocklists'] },
  spf: { stages: ['dns'], external: [] },
  blocklist: { stages: ['dns'], external: ['blocklists'] },
  'website-health': { stages: ['http', 'files', 'cert'], external: ['safeBrowsing', 'retire', 'osv'] },
  ssl: { stages: ['http', 'cert'], external: [] },
  performance: { stages: ['http'], external: ['psi', 'crux'] },
  'ai-readiness': { stages: ['http', 'files'], external: [] },
  wordpress: { stages: ['http', 'files'], external: ['wordpress', 'eol'] },
  php: { stages: ['http'], external: ['eol'] },
  dns: { stages: ['dns', 'http'], external: ['propagation', 'greenWeb', 'internetDb', 'geo'] },
  stack: { stages: ['dns', 'http', 'files', 'cert', 'browser'], external: ['eol'] },
  'js-libraries': { stages: ['http', 'files'], external: ['retire', 'osv'] },
  subdomains: { stages: [], external: ['subdomains'] },
  privacy: { stages: ['http', 'files', 'browser'], external: [] }
};

export const SCOPES = Object.keys(RAW);

export const isScope = (s: unknown): s is string => typeof s === 'string' && Object.prototype.hasOwnProperty.call(RAW, s);

/** The plan for a scope; anything unknown is a full scan. Stage dependencies are closed over. */
export function planFor(scope: string | null | undefined): ScopePlan {
  const raw = RAW[scope && isScope(scope) ? scope : 'full']!;
  const stages = new Set<StageName>(raw.stages);
  if (stages.has('files') || stages.has('browser')) stages.add('http');
  if (raw.external.length) stages.add('external');
  return { stages: STAGE_ORDER.filter((s) => stages.has(s)), external: raw.external };
}

/** A full scan answers any focused request; a focused scan answers only the same tool. */
export const scopeSatisfies = (have: string | null | undefined, want: string | null | undefined): boolean => (have ?? 'full') === 'full' || (have ?? 'full') === (want ?? 'full');

/** Note stored on stages a scope did not need, so the UI can tell "skipped on purpose" from "skipped because something broke". */
export const NOT_NEEDED = 'Not needed for this tool';
