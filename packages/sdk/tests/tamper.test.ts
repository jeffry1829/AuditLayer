import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuditLogEntrySchema, verifyChain, type AuditLogEntry } from '@vouchrail/schema';

import { AuditLogger } from '../src/audit-logger.js';
import { LocalStorageBackend } from '../src/backends/local.js';
import { STORAGE_DEFAULTS } from '../src/defaults.js';

const TEST_SECRET = 'test-secret-key-with-enough-length-1234567890';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(STORAGE_DEFAULTS.jsonlExtension)) out.push(p);
  }
  return out;
}

async function generateChain(audit: AuditLogger, n: number): Promise<AuditLogEntry[]> {
  const out: AuditLogEntry[] = [];
  for (let i = 0; i < n; i++) {
    const callId = await audit.startCall({
      caseId: `case-${i % 5}`,
      modelProvider: 'anthropic',
      modelName: 'claude-3-5-sonnet',
      modelVersion: '20241022',
      promptTemplateId: 'tpl',
      promptTemplateVersion: '1.0.0',
      operatorId: 'op',
      input: { i },
    });
    out.push(await audit.endCall(callId, { output: { i } }));
  }
  return out;
}

describe('tamper-test', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vouchrail-tamper-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('generates 100 entries, modifies entry 50, verify identifies tampering at index 50', async () => {
    const audit = new AuditLogger({
      systemId: 'sys-tamper',
      storage: { type: 'local', dir },
      signingKey: { kind: 'inline', secret: TEST_SECRET },
      hashChain: { enabled: true, algorithm: 'sha256' },
    });
    const originalEntries = await generateChain(audit, 100);
    await audit.close();
    expect(originalEntries).toHaveLength(100);

    // Read back from disk and confirm a clean chain.
    const backend = new LocalStorageBackend({ type: 'local', dir });
    const fromDisk: AuditLogEntry[] = [];
    for await (const e of backend.list({ systemId: 'sys-tamper' })) {
      fromDisk.push(e);
    }
    expect(fromDisk).toHaveLength(100);
    expect(verifyChain(fromDisk).valid).toBe(true);

    // Tamper with entry 50 on disk.
    const files = walk(join(dir, 'sys-tamper')).sort();
    let tamperedFileLine: { file: string; lineIndex: number } | null = null;
    let globalIndex = 0;
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        if (globalIndex === 50) {
          tamperedFileLine = { file: f, lineIndex: i };
        }
        globalIndex++;
      }
    }
    expect(tamperedFileLine).not.toBeNull();
    const fileContents = readFileSync(tamperedFileLine!.file, 'utf8');
    const lines = fileContents.split('\n');
    const target = JSON.parse(lines[tamperedFileLine!.lineIndex]!) as AuditLogEntry;
    // Modify a logged field. Do NOT modify entryHash so the tampering is
    // proven by the entry-hash mismatch.
    target.outputDecision = { tampered: true };
    lines[tamperedFileLine!.lineIndex] = JSON.stringify(target);
    writeFileSync(tamperedFileLine!.file, lines.join('\n'));

    // Re-read and verify — must fail at index 50.
    const backend2 = new LocalStorageBackend({ type: 'local', dir });
    const reread: AuditLogEntry[] = [];
    for await (const e of backend2.list({ systemId: 'sys-tamper' })) {
      reread.push(AuditLogEntrySchema.parse(e));
    }
    expect(reread).toHaveLength(100);
    const result = verifyChain(reread);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.brokenAt).toBe(50);
      expect(result.reason).toBe('entry_hash_mismatch');
    }
  });
});
