/**
 * Underwriting policy parameters for the credit-decision example.
 *
 * Lifted out of `index.ts` so they can be tuned (or replaced from a JSON
 * policy file) without touching the audit logging flow. None of these
 * numbers are "magic" — each comes from a documented credit policy and is
 * recorded as `modelConfiguration.policyVersion` in the audit log.
 */

export interface CreditPolicyConfig {
  /** Policy version recorded in modelConfiguration. */
  policyVersion: string;
  /** Minimum credit score (FICO-like 300-850 scale) to consider for any approval. */
  minCreditScore: number;
  /** Credit score at and above which the borrower qualifies for the prime APR tier. */
  primeCreditScore: number;
  /** Maximum debt-to-income ratio before escalation to human review. */
  maxDti: number;
  /** Default term length in months for approved loans. */
  termMonths: number;
  /** APR (basis points) for prime-tier borrowers. */
  aprBpsPrime: number;
  /** APR (basis points) for standard-tier borrowers. */
  aprBpsStandard: number;
  /** Multiplier on requested amount used to estimate additional monthly debt service. */
  requestedAmountServicingFactor: number;
}

export const CREDIT_POLICY: CreditPolicyConfig = {
  policyVersion: '7.1',
  minCreditScore: 640,
  primeCreditScore: 750,
  maxDti: 0.45,
  termMonths: 36,
  aprBpsPrime: 750,
  aprBpsStandard: 1250,
  requestedAmountServicingFactor: 0.05,
} as const;
