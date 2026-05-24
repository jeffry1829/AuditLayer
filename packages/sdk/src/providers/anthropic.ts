import type { WrapContext } from '../config.js';

import { wrapCreate } from './shared.js';
import type { ProviderAdapter, ProviderHostLogger } from './types.js';

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

interface AnthropicClient extends Record<string, unknown> {
  messages: { create: CreateFn };
}

export function deriveAnthropicModelVersion(model: string): string {
  const m = ANTHROPIC_SNAPSHOT_REGEX.exec(model);
  return m ? m[1]! : model || 'unknown';
}

export const anthropicAdapter: ProviderAdapter = {
  providerId: 'anthropic',

  detect(client: object): boolean {
    const c = client as Record<string, unknown>;
    const messages = c['messages'] as Record<string, unknown> | undefined;
    return typeof messages?.['create'] === 'function';
  },

  wrap(audit: ProviderHostLogger, client: object, context: WrapContext): void {
    const anthropic = client as AnthropicClient;
    const messages = anthropic.messages;
    const originalCreate = messages.create.bind(messages);
    messages.create = wrapCreate(audit, originalCreate, context, {
      providerId: 'anthropic',
      configKeys: ANTHROPIC_CONFIG_KEYS,
      outputKeys: ANTHROPIC_OUTPUT_KEYS,
      buildModelInfo: (params) => ({
        modelName: String(params['model'] ?? 'unknown'),
        modelVersion: deriveAnthropicModelVersion(String(params['model'] ?? '')),
      }),
      buildInput: (params) => ({ messages: params['messages'], system: params['system'] }),
    });
  },
};
