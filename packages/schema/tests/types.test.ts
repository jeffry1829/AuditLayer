import { describe, expect, it } from 'vitest';

import {
  AuditLogEntryInputSchema,
  AuditLogEntrySchema,
  HumanReviewSchema,
  ToolCallSchema,
  SCHEMA_VERSION,
} from '../src/types.js';

function baseInput() {
  return {
    schemaVersion: SCHEMA_VERSION,
    recordedBy: '@auditlayer/sdk@0.1.0',
    callId: 'call-1',
    caseId: 'case-1',
    systemId: 'sys-1',
    startedAt: '2026-05-19T12:00:00.000Z',
    endedAt: '2026-05-19T12:00:01.000Z',
    durationMs: 1000,
    modelProvider: 'anthropic',
    modelName: 'claude-3-5-sonnet',
    modelVersion: '20241022',
    modelConfiguration: { temperature: 0.2 },
    promptTemplateId: 'tpl-1',
    promptTemplateVersion: '1.0.0',
    promptFingerprint: 'a'.repeat(64),
    inputFingerprint: 'b'.repeat(64),
    outputFingerprint: 'c'.repeat(64),
    outputDecision: { ok: true },
    operatorId: 'op-1',
  };
}

describe('AuditLogEntryInputSchema', () => {
  it('accepts a minimal valid input', () => {
    expect(() => AuditLogEntryInputSchema.parse(baseInput())).not.toThrow();
  });

  it('rejects when fingerprint is not 64-char hex', () => {
    const bad = { ...baseInput(), promptFingerprint: 'NOTHEX' };
    expect(() => AuditLogEntryInputSchema.parse(bad)).toThrow();
  });

  it('rejects an empty callId', () => {
    expect(() => AuditLogEntryInputSchema.parse({ ...baseInput(), callId: '' })).toThrow();
  });

  it('rejects a non-ISO timestamp', () => {
    expect(() =>
      AuditLogEntryInputSchema.parse({ ...baseInput(), startedAt: 'yesterday' }),
    ).toThrow();
  });

  it('rejects an unknown schemaVersion', () => {
    expect(() =>
      AuditLogEntryInputSchema.parse({ ...baseInput(), schemaVersion: 'unknown-v2' }),
    ).toThrow();
  });

  it('allows custom modelProvider strings (open enum)', () => {
    const out = AuditLogEntryInputSchema.parse({ ...baseInput(), modelProvider: 'mistral' });
    expect(out.modelProvider).toBe('mistral');
  });

  it('strips unknown top-level fields via strict()', () => {
    const withExtra = { ...baseInput(), unknownField: 'whatever' };
    expect(() => AuditLogEntryInputSchema.parse(withExtra)).toThrow();
  });
});

describe('AuditLogEntrySchema', () => {
  it('requires entryHash and signature', () => {
    expect(() => AuditLogEntrySchema.parse(baseInput())).toThrow();
  });

  it('accepts a complete entry', () => {
    const entry = {
      ...baseInput(),
      previousEntryHash: 'd'.repeat(64),
      entryHash: 'e'.repeat(64),
      signature: 'sig-1',
    };
    expect(() => AuditLogEntrySchema.parse(entry)).not.toThrow();
  });
});

describe('ToolCallSchema', () => {
  it('accepts a minimal tool call', () => {
    expect(() =>
      ToolCallSchema.parse({
        toolName: 'search',
        inputFingerprint: 'a'.repeat(64),
        outputFingerprint: 'b'.repeat(64),
        startedAt: '2026-05-19T12:00:00.000Z',
        endedAt: '2026-05-19T12:00:00.500Z',
      }),
    ).not.toThrow();
  });
});

describe('HumanReviewSchema', () => {
  it('accepts an approval review', () => {
    expect(() =>
      HumanReviewSchema.parse({
        reviewerId: 'reviewer-1',
        reviewedAt: '2026-05-19T13:00:00.000Z',
        decision: 'approve',
      }),
    ).not.toThrow();
  });

  it('rejects an unknown decision value', () => {
    expect(() =>
      HumanReviewSchema.parse({
        reviewerId: 'reviewer-1',
        reviewedAt: '2026-05-19T13:00:00.000Z',
        decision: 'maybe',
      }),
    ).toThrow();
  });
});
