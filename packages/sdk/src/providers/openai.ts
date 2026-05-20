import type { WrapContext } from '../config.js';

import {
  PROVIDER_ERROR_RISK_FLAG,
  type ProviderAdapter,
  type ProviderHostLogger,
} from './types.js';

/** Keys forwarded into `modelConfiguration` from the OpenAI request params. */
export const OPENAI_CONFIG_KEYS: readonly string[] = [
  'temperature',
  'top_p',
  'max_tokens',
  'frequency_penalty',
  'presence_penalty',
];

/** Keys retained from the OpenAI response when building the output snapshot. */
export const OPENAI_OUTPUT_KEYS: readonly string[] = ['choices', 'usage', 'model', 'id'];

type CreateFn = (...args: unknown[]) => Promise<unknown>;

interface OpenAiClient {
  chat: { completions: { create: CreateFn } };
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

export const openaiAdapter: ProviderAdapter<OpenAiClient> = {
  providerId: 'openai',

  detect(client: object): boolean {
    const c = client as Record<string, unknown>;
    const chat = c['chat'] as Record<string, unknown> | undefined;
    const completions = chat?.['completions'] as Record<string, unknown> | undefined;
    return typeof completions?.['create'] === 'function';
  },

  wrap(audit: ProviderHostLogger, client: OpenAiClient, context: WrapContext): OpenAiClient {
    const completions = client.chat.completions;
    const originalCreate = completions.create.bind(completions);
    completions.create = async (...args: unknown[]) => {
      const params = (args[0] as Record<string, unknown>) ?? {};
      const callId = await audit.startCall({
        caseId: context.caseId,
        sessionId: context.sessionId,
        parentCallId: context.parentCallId,
        modelProvider: 'openai',
        modelName: String(params['model'] ?? 'unknown'),
        modelVersion: String(params['model'] ?? ''),
        modelConfiguration: pickKeys(params, OPENAI_CONFIG_KEYS),
        promptTemplateId: context.promptTemplateId,
        promptTemplateVersion: context.promptTemplateVersion,
        operatorId: context.operatorId,
        input: { messages: params['messages'] },
      });
      try {
        const response = await originalCreate(...args);
        const output = extractOutput(response, OPENAI_OUTPUT_KEYS);
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
