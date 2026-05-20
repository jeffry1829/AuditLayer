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
 */
export interface ProviderAdapter<TClient extends object = object> {
  /** Stable identifier matching ModelProvider. */
  readonly providerId: ModelProvider;

  /** Return true if the candidate client appears to be this provider's SDK. */
  detect(client: object): boolean;

  /**
   * Mutate the client in-place so calls to the provider's generation method
   * are intercepted. Returns the same client for chaining.
   */
  wrap(audit: ProviderHostLogger, client: TClient, context: WrapContext): TClient;
}

/** Risk flag emitted when a provider call surfaces an error to AuditLayer. */
export const PROVIDER_ERROR_RISK_FLAG = 'provider_error';
