import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '@vouchrail/schema';

import { LocalStorageBackend } from '../src/backends/local.js';

import { mkTmpAuditDir } from './_helpers.js';

const cleanEntry = {
  schemaVersion: SCHEMA_VERSION,
  recordedBy: '@vouchrail/sdk@0.1.0',
  callId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  caseId: 'case-1',
  systemId: 'sys-local-ts',
  startedAt: '2026-05-19T00:00:00.000Z',
  endedAt: '2026-05-19T00:00:01.000Z',
  durationMs: 1000,
  modelProvider: 'anthropic',
  modelName: 'claude-3-5-sonnet',
  modelVersion: '20241022',
  modelConfiguration: {},
  promptTemplateId: 'tpl',
  promptTemplateVersion: '1.0.0',
  promptFingerprint: 'a'.repeat(64),
  inputFingerprint: 'b'.repeat(64),
  outputFingerprint: 'c'.repeat(64),
  outputDecision: { ok: true },
  operatorId: 'op-1',
  entryHash: 'd'.repeat(64),
  previousEntryHash: 'e'.repeat(64),
  signature: 'sig',
};

describe('LocalStorageBackend list() bad-line handling', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkTmpAuditDir('local-ts-');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns nothing when the system root does not exist', async () => {
    const backend = new LocalStorageBackend({ type: 'local', dir });
    const out = [];
    for await (const e of backend.list({ systemId: 'never-written' })) {
      out.push(e);
    }
    expect(out).toHaveLength(0);
  });

  it('skips empty lines, malformed JSON, and schema-invalid lines', async () => {
    // Hand-write a JSONL file at the path the backend expects so we can
    // pollute it with bad lines. The clean line still survives.
    const fileDir = join(dir, 'sys-local-ts', '2026', '05', '19');
    mkdirSync(fileDir, { recursive: true });
    const file = join(fileDir, '00.jsonl');
    const lines = [
      JSON.stringify(cleanEntry),
      '',
      '   ',
      '{not valid json',
      JSON.stringify({ schemaVersion: 'wrong-schema' }),
    ];
    writeFileSync(file, lines.join('\n') + '\n', 'utf8');

    const backend = new LocalStorageBackend({ type: 'local', dir });
    const out = [];
    for await (const e of backend.list({ systemId: 'sys-local-ts' })) {
      out.push(e);
    }
    expect(out).toHaveLength(1);
    expect(out[0]!.callId).toBe(cleanEntry.callId);
  });
});
