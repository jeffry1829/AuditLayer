import type { ModelProvider } from '@auditlayer/schema';

import type { WrapContext } from '../config.js';

/**
 * Minimal logger surface a provider adapter needs. Avoids importing the full
 * AuditLogger class to keep adapters free of circular references.
 */
export interface ProviderHostLogger {
  startCall(input: {
    caseId: string;
    sessionId?: string;
    parentCallId?: string;
    modelProvider: ModelProvider;
    modelName: string;
    modelVersion: string;
    modelConfiguration?: Record<string, unknown>;
    promptTemplateId: string;
    promptTemplateVersion: string;
    operatorId: string;
    input?: unknown;
    prompt?: unknown;
    referenceDatabase?: string;
  }): Promise<string>;

  endCall(
    callId: string,
    end: {
      output?: unknown;
      outputDecision?: unknown;
      reasonCodes?: string[];
      riskFlags?: string[];
    },
  ): Promise<unknown>;
}

/**
 * Provider adapter contract. One implementation per provider SDK. Adapters are
 * pure: no logging, no side effects outside the wrapped client's call path.
 *
 * Adding a new provider = adding one ProviderAdapter to the registry. No edits
 * to AuditLogger.wrap or detectProvider required.
 *
 * Contract notes:
 * - `detect` MUST be a pure read of the client's shape. No side effects.
 * - `wrap` MUST mutate the client in place (so the caller keeps its
 *   reference). It is invoked with the same `client` value that the registry
 *   handed to `detect`; the registry returns that original reference to
 *   callers regardless of what `wrap` returns. Returning `void` is fine.
 */
export interface ProviderAdapter {
  /** Stable identifier matching ModelProvider. */
  readonly providerId: ModelProvider;

  /** Return true if the candidate client appears to be this provider's SDK. */
  detect(client: object): boolean;

  /**
   * Mutate the client in-place so calls to the provider's generation method
   * are intercepted. The return value is ignored by the registry.
   */
  wrap(audit: ProviderHostLogger, client: object, context: WrapContext): unknown;
}

/** Risk flag emitted when a provider call surfaces an error to AuditLayer. */
export const PROVIDER_ERROR_RISK_FLAG = 'provider_error';
