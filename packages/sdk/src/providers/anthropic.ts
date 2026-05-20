import type { WrapContext } from '../config.js';

import {
  PROVIDER_ERROR_RISK_FLAG,
  type ProviderAdapter,
  type ProviderHostLogger,
} from './types.js';

/** Keys forwarded into `modelConfiguration` from the Anthropic request params. */
export const ANTHROPIC_CONFIG_KEYS: readonly string[] = [
  'temperature',
  'top_p',
  'top_k',
  'max_tokens',
  'stop_sequences',
];

/** Keys retained from the Anthropic response when building the output snapshot. */
export const ANTHROPIC_OUTPUT_KEYS: readonly string[] = ['content', 'usage', 'model', 'id'];

/** Anthropic encodes a snapshot date as the trailing -YYYYMMDD on model strings. */
export const ANTHROPIC_SNAPSHOT_REGEX = /-(\d{8})$/;

type CreateFn = (...args: unknown[]) => Promise<unknown>;

interface AnthropicClient {
  messages: { create: CreateFn };
}

export function deriveAnthropicModelVersion(model: string): string {
  const m = ANTHROPIC_SNAPSHOT_REGEX.exec(model);
  return m ? m[1]! : model || 'unknown';
}

function pickKeys(
  params: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in params) out[key] = params[key];
  }
  return out;
}

function extractOutput(response: unknown, keys: readonly string[]): unknown {
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = r[key];
    return out;
  }
  return response ?? null;
}

export const anthropicAdapter: ProviderAdapter<AnthropicClient> = {
  providerId: 'anthropic',

  detect(client: object): boolean {
    const c = client as Record<string, unknown>;
    const messages = c['messages'] as Record<string, unknown> | undefined;
    return typeof messages?.['create'] === 'function';
  },

  wrap(audit: ProviderHostLogger, client: AnthropicClient, context: WrapContext): AnthropicClient {
    const messages = client.messages;
    const originalCreate = messages.create.bind(messages);
    messages.create = async (...args: unknown[]) => {
      const params = (args[0] as Record<string, unknown>) ?? {};
      const callId = await audit.startCall({
        caseId: context.caseId,
        sessionId: context.sessionId,
        parentCallId: context.parentCallId,
        modelProvider: 'anthropic',
        modelName: String(params['model'] ?? 'unknown'),
        modelVersion: deriveAnthropicModelVersion(String(params['model'] ?? '')),
        modelConfiguration: pickKeys(params, ANTHROPIC_CONFIG_KEYS),
        promptTemplateId: context.promptTemplateId,
        promptTemplateVersion: context.promptTemplateVersion,
        operatorId: context.operatorId,
        input: { messages: params['messages'], system: params['system'] },
      });
      try {
        const response = await originalCreate(...args);
        const output = extractOutput(response, ANTHROPIC_OUTPUT_KEYS);
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
    return client;
  },
};
