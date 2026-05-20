/**
 * Resume-screening scoring policy + model invocation config.
 *
 * Production deployments would load this from a versioned policy file and
 * stamp the policy version into ``modelConfiguration.policyVersion``.
 */

export interface ResumeScoringConfig {
  /** Prompt template stamped into the audit entry. */
  promptTemplateId: string;
  promptTemplateVersion: string;
  /** Model identifier passed to the provider SDK. */
  modelName: string;
  /** Model hyperparameters fed to the provider on every call. */
  modelMaxTokens: number;
  modelTemperature: number;
  /** Score at/above which a candidate is recommended for next round. */
  recommendThreshold: number;
  /** Base score before keyword adjustments. */
  baseScore: number;
  /** Maximum bounded score. */
  maxScore: number;
  /** Keyword list, each adds +1 to the mock score. Replace with real model in production. */
  positiveKeywords: readonly string[];
}

export const RESUME_SCORING: ResumeScoringConfig = {
  promptTemplateId: 'resume-scoring-v3',
  promptTemplateVersion: '3.2.1',
  modelName: 'claude-3-5-sonnet-20241022',
  modelMaxTokens: 256,
  modelTemperature: 0.1,
  recommendThreshold: 7,
  baseScore: 5,
  maxScore: 10,
  positiveKeywords: ['PostgreSQL', 'Kubernetes', 'compliance', 'AI', 'React'],
} as const;
