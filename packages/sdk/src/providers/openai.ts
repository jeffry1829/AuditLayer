import type { WrapContext } from '../config.js';

import { wrapCreate } from './shared.js';
import type { ProviderAdapter, ProviderHostLogger } from './types.js';

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

interface OpenAiClient extends Record<string, unknown> {
  chat: { completions: { create: CreateFn } };
}

export const openaiAdapter: ProviderAdapter = {
  providerId: 'openai',

  detect(client: object): boolean {
    const c = client as Record<string, unknown>;
    const chat = c['chat'] as Record<string, unknown> | undefined;
    const completions = chat?.['completions'] as Record<string, unknown> | undefined;
    return typeof completions?.['create'] === 'function';
  },

  wrap(audit: ProviderHostLogger, client: object, context: WrapContext): void {
    const openai = client as OpenAiClient;
    const completions = openai.chat.completions;
    const originalCreate = completions.create.bind(completions);
    completions.create = wrapCreate(audit, originalCreate, context, {
      providerId: 'openai',
      configKeys: OPENAI_CONFIG_KEYS,
      outputKeys: OPENAI_OUTPUT_KEYS,
      // OpenAI doesn't expose a snapshot suffix the way Anthropic does;
      // reuse the model id so AuditLogEntryInputSchema's modelVersion.min(1)
      // constraint is always satisfied.
      buildModelInfo: (params) => {
        const model = String(params['model'] ?? 'unknown');
        return { modelName: model, modelVersion: model };
      },
      buildInput: (params) => ({ messages: params['messages'] }),
    });
  },
};
