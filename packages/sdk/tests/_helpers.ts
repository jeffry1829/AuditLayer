/**
 * Shared test helpers. Files inside packages/sdk/tests/* import from here
 * to avoid restating the same TEST_SECRET / makeLogger / collectAll
 * boilerplate across nine test files.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AuditLogEntry } from '@vouchrail/schema';

import { AuditLogger } from '../src/audit-logger.js';
import type { LocalStorageBackend } from '../src/backends/local.js';
import type { AuditLoggerConfig } from '../src/config.js';

export const TEST_SECRET = 'test-secret-key-with-enough-length-1234567890';

/** Construct an AuditLogger writing JSONL to a local directory. */
export function makeLocalLogger(
  dir: string,
  overrides: Partial<AuditLoggerConfig> = {},
): AuditLogger {
  return new AuditLogger({
    systemId: 'sys-test',
    storage: { type: 'local', dir },
    signingKey: { kind: 'inline', secret: TEST_SECRET },
    ...overrides,
  });
}

/** Create a per-test tempdir under tmpdir() with a vouchrail prefix. */
export function mkTmpAuditDir(suffix = ''): string {
  return mkdtempSync(join(tmpdir(), `vouchrail-${suffix}`));
}

/** Drain all entries a backend's list() yields for a given systemId. */
export async function collectAll(
  backend: LocalStorageBackend,
  systemId: string,
): Promise<AuditLogEntry[]> {
  const out: AuditLogEntry[] = [];
  for await (const entry of backend.list({ systemId })) {
    out.push(entry);
  }
  return out;
}
