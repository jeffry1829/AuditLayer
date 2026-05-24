/**
 * Helpers reused by every provider adapter. Adapters interact with arbitrary
 * provider SDK request/response shapes through structural typing, so we keep
 * the helpers untyped (`unknown`) at the boundary and let each adapter cast
 * its inputs.
 */

import type { WrapContext } from '../config.js';

import { PROVIDER_ERROR_RISK_FLAG, type ProviderHostLogger } from './types.js';

export function pickKeys(
  params: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in params) out[key] = params[key];
  }
  return out;
}

export function extractOutput(response: unknown, keys: readonly string[]): unknown {
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = r[key];
    return out;
  }
  return response ?? null;
}

export interface WrapCreateOptions {
  providerId: string;
  configKeys: readonly string[];
  outputKeys: readonly string[];
  buildModelInfo: (params: Record<string, unknown>) => {
    modelName: string;
    modelVersion: string;
  };
  buildInput: (params: Record<string, unknown>) => unknown;
}

/**
 * Wrap a provider's `create` function so each call emits a start/end audit
 * pair around the original. Every built-in adapter funnels through this so
 * the start-success-end / start-fail-end / fingerprint sequence is defined
 * in exactly one place.
 */
export function wrapCreate(
  audit: ProviderHostLogger,
  original: (...args: unknown[]) => Promise<unknown>,
  context: WrapContext,
  opts: WrapCreateOptions,
): (...args: unknown[]) => Promise<unknown> {
  return async (...args: unknown[]) => {
    const params = (args[0] as Record<string, unknown>) ?? {};
    const { modelName, modelVersion } = opts.buildModelInfo(params);
    const callId = await audit.startCall({
      caseId: context.caseId,
      sessionId: context.sessionId,
      parentCallId: context.parentCallId,
      modelProvider: opts.providerId,
      modelName,
      modelVersion,
      modelConfiguration: pickKeys(params, opts.configKeys),
      promptTemplateId: context.promptTemplateId,
      promptTemplateVersion: context.promptTemplateVersion,
      operatorId: context.operatorId,
      input: opts.buildInput(params),
    });
    try {
      const response = await original(...args);
      const output = extractOutput(response, opts.outputKeys);
      await audit.endCall(callId, { output, outputDecision: output });
      return response;
    } catch (err) {
      await audit.endCall(callId, {
        output: null,
        outputDecision: null,
        riskFlags: [PROVIDER_ERROR_RISK_FLAG],
      });
      throw err;
    }
  };
}
