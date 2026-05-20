/**
 * Clinical-decision-support policy parameters for the healthcare-triage example.
 */

export interface TriagePolicyConfig {
  /** Confidence below this threshold raises a low-confidence risk flag. */
  lowConfidenceThreshold: number;
  /** Triage levels at or below this auto-trigger human-clinician review. */
  humanReviewMaxLevel: 1 | 2 | 3 | 4 | 5;
  /** Pulse-oximetry threshold below which red-flag symptoms escalate to level 1. */
  spo2RedFlagThreshold: number;
  /** Reference symptoms matched against patient input. Source: triage policy v4. */
  redFlagSymptomPatterns: readonly RegExp[];
  /** ICD/BNF or other clinical reference DB recorded in referenceDatabase. */
  referenceDatabase: string;
  /** Default routine triage level / confidence when no red flags fire. */
  defaultLevel: 1 | 2 | 3 | 4 | 5;
  defaultConfidence: number;
}

export const TRIAGE_POLICY: TriagePolicyConfig = {
  lowConfidenceThreshold: 0.7,
  humanReviewMaxLevel: 2,
  spo2RedFlagThreshold: 94,
  redFlagSymptomPatterns: [/chest pain/, /shortness of breath/, /stroke/],
  referenceDatabase: 'BNF-edition-2026/Q2',
  defaultLevel: 4,
  defaultConfidence: 0.6,
} as const;
