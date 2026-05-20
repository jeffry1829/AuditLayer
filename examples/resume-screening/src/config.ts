/**
 * Resume-screening scoring policy.
 */

export interface ResumeScoringConfig {
  /** Score at/above which a candidate is recommended for next round. */
  recommendThreshold: number;
  /** Base score before keyword adjustments. */
  baseScore: number;
  /** Maximum bounded score. */
  maxScore: number;
  /** Keyword list each adds +1 to the mock score. Replace with real model in production. */
  positiveKeywords: readonly string[];
}

export const RESUME_SCORING: ResumeScoringConfig = {
  recommendThreshold: 7,
  baseScore: 5,
  maxScore: 10,
  positiveKeywords: ['PostgreSQL', 'Kubernetes', 'compliance', 'AI', 'React'],
} as const;
