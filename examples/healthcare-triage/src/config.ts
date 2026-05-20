/**
 * Clinical-decision-support policy parameters for the healthcare-triage example.
 *
 * Every tunable knob lives here; the application code never inlines a
 * threshold or confidence value. Production deployments would load this from
 * a versioned JSON/YAML policy file and stamp the policy version into
 * ``modelConfiguration.policyVersion`` on every entry.
 */

export interface TriagePolicyConfig {
  /** Policy version stamped into modelConfiguration. */
  policyVersion: string;
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
  /** Confidence assigned when a red flag + low SpO2 both fire (level 1). */
  redFlagLowSpo2Confidence: number;
  /** Confidence assigned when a red flag fires without low SpO2 (level 2). */
  redFlagAloneConfidence: number;
  /** Days the example retains entries; health records target 10y per HIPAA-like rules. */
  retentionTargetDays: number;
}

export const TRIAGE_POLICY: TriagePolicyConfig = {
  policyVersion: '4.0.0',
  lowConfidenceThreshold: 0.7,
  humanReviewMaxLevel: 2,
  spo2RedFlagThreshold: 94,
  redFlagSymptomPatterns: [/chest pain/, /shortness of breath/, /stroke/],
  referenceDatabase: 'BNF-edition-2026/Q2',
  defaultLevel: 4,
  defaultConfidence: 0.6,
  redFlagLowSpo2Confidence: 0.92,
  redFlagAloneConfidence: 0.78,
  retentionTargetDays: 3650,
} as const;
