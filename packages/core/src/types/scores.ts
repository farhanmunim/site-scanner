/** Scores: transparent points-based, see analyze/score.ts. */
import type { FindingStatus } from './report.js';


export type ScoreSectionId = 'headers' | 'tls' | 'performance' | 'seo' | 'email' | 'privacy';
export interface ScorePenalty {
  findingId: string;
  title: string;
  status: FindingStatus;
  points: number;
}
export interface SectionScore {
  id: ScoreSectionId;
  label: string;
  /** 0–100, or null when the section was not assessed (excluded from the overall). */
  score: number | null;
  weight: number;
  penalties: ScorePenalty[];
  note?: string;
}
export interface Scores {
  version: 1;
  overall: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  summary: string;
  sections: SectionScore[];
}
