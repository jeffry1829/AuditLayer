import type { ModelProvider } from '@auditlayer/schema';

import type { WrapContext } from '../config.js';
import { AuditLayerProviderError, ERROR_CODES } from '../errors.js';

import { anthropicAdapter } from './anthropic.js';
import { openaiAdapter } from './openai.js';
import type { ProviderAdapter, ProviderHostLogger } from './types.js';

/**
 * Built-in provider adapters. Tier B / C adapters (Bedrock, Azure, Google,
 * Mistral) will register here as they ship.
 */
export const BUILT_IN_PROVIDER_ADAPTERS: readonly ProviderAdapter[] = Object.freeze([
  anthropicAdapter,
  openaiAdapter,
]);

/**
 * Mutable provider registry. Custom adapters supplied by the SDK consumer are
 * registered via `registerProvider`. Order of resolution: explicit registrations
 * first, then built-ins. First adapter whose `detect()` returns true wins.
 */
const customAdapters: ProviderAdapter[] = [];

export function registerProvider(adapter: ProviderAdapter): void {
  customAdapters.push(adapter);
}

export function unregisterProvider(providerId: ModelProvider): void {
  const idx = customAdapters.findIndex((a) => a.providerId === providerId);
  if (idx >= 0) customAdapters.splice(idx, 1);
}

export function resolveAdapters(): readonly ProviderAdapter[] {
  return [...customAdapters, ...BUILT_IN_PROVIDER_ADAPTERS];
}

export function detectAdapter(client: object): ProviderAdapter | null {
  for (const adapter of resolveAdapters()) {
    if (adapter.detect(client)) return adapter;
  }
  return null;
}

/**
 * Wrap a third-party provider client. Throws `AuditLayerProviderError` if no
 * adapter recognises the client shape.
 */
export function wrapClient<T extends object>(
  audit: ProviderHostLogger,
  client: T,
  context: WrapContext,
): T {
  const adapter = detectAdapter(client);
  if (!adapter) {
    throw new AuditLayerProviderError(
      ERROR_CODES.PROVIDER_UNSUPPORTED_CLIENT,
      'AuditLogger.wrap: client does not match any registered provider adapter. ' +
        'Built-in adapters: ' +
        BUILT_IN_PROVIDER_ADAPTERS.map((a) => a.providerId).join(', ') +
        '. Use startCall/endCall directly for unsupported clients, or call ' +
        'registerProvider() with a custom adapter.',
      { registered: resolveAdapters().map((a) => a.providerId) },
    );
  }
  return (adapter.wrap as (audit: ProviderHostLogger, client: T, context: WrapContext) => T)(
    audit,
    client,
    context,
  );
}
