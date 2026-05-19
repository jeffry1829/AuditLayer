import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '@auditlayer/schema';

import { S3StorageBackend } from '../src/backends/s3.js';

const sampleEntry = {
  schemaVersion: SCHEMA_VERSION,
  recordedBy: '@auditlayer/sdk@0.1.0',
  callId: 'call-1',
  caseId: 'case-1',
  systemId: 'sys',
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
  operatorId: 'op',
  entryHash: 'd'.repeat(64),
  previousEntryHash: 'e'.repeat(64),
  signature: 'sig',
};

class MockCmd {
  readonly name = this.constructor.name;
  constructor(readonly input: Record<string, unknown>) {}
}
class PutObjectCommand extends MockCmd {}
class GetObjectCommand extends MockCmd {}
class ListObjectsV2Command extends MockCmd {}

class FakeS3Client {
  readonly sent: MockCmd[] = [];
  constructor(readonly listResult: { Contents: Array<{ Key: string }>; IsTruncated?: boolean }) {}
  async send(cmd: MockCmd) {
    this.sent.push(cmd);
    if (cmd.name === 'PutObjectCommand') return {};
    if (cmd.name === 'ListObjectsV2Command') {
      return this.listResult;
    }
    if (cmd.name === 'GetObjectCommand') {
      return {
        Body: {
          transformToString: async () => JSON.stringify(sampleEntry),
        },
      };
    }
    return {};
  }
}

function makeBackend(
  prefix?: string,
  listResult = { Contents: [{ Key: 'sys/2026/05/19/00-call-1.json' }] },
) {
  const client = new FakeS3Client(listResult);
  const backend = new S3StorageBackend(
    { type: 's3', bucket: 'b', region: 'eu-west-1', prefix },
    {
      sdk: {
        S3Client: FakeS3Client as never,
        PutObjectCommand: PutObjectCommand as never,
        GetObjectCommand: GetObjectCommand as never,
        ListObjectsV2Command: ListObjectsV2Command as never,
      },
      client,
    },
  );
  return { backend, client };
}

describe('S3StorageBackend', () => {
  it('appends an entry with a sortable key path including prefix', async () => {
    const { backend, client } = makeBackend('audit');
    await backend.append(sampleEntry as never, { systemId: 'sys' });
    const put = client.sent.find((c) => c.name === 'PutObjectCommand');
    expect(put).toBeTruthy();
    expect(put!.input.Bucket).toBe('b');
    expect(put!.input.Key).toBe('audit/sys/2026/05/19/00-call-1.json');
    expect(put!.input.ChecksumAlgorithm).toBe('SHA256');
  });

  it('appends without prefix when not configured', async () => {
    const { backend, client } = makeBackend(undefined);
    await backend.append(sampleEntry as never, { systemId: 'sys' });
    const put = client.sent.find((c) => c.name === 'PutObjectCommand');
    expect(put!.input.Key).toBe('sys/2026/05/19/00-call-1.json');
  });

  it('lists entries via ListObjectsV2 + GetObject', async () => {
    const { backend, client } = makeBackend();
    const out = [];
    for await (const entry of backend.list({ systemId: 'sys' })) {
      out.push(entry);
    }
    expect(out).toHaveLength(1);
    expect(out[0]!.callId).toBe('call-1');
    expect(client.sent.some((c) => c.name === 'ListObjectsV2Command')).toBe(true);
    expect(client.sent.some((c) => c.name === 'GetObjectCommand')).toBe(true);
  });

  it('skips entries whose caseId does not match the filter', async () => {
    const { backend } = makeBackend();
    const out = [];
    for await (const entry of backend.list({ systemId: 'sys', caseId: 'other-case' })) {
      out.push(entry);
    }
    expect(out).toHaveLength(0);
  });

  it('paginates via continuation tokens', async () => {
    class PaginatingS3Client {
      readonly sent: MockCmd[] = [];
      private page = 0;
      async send(cmd: MockCmd) {
        this.sent.push(cmd);
        if (cmd.name === 'ListObjectsV2Command') {
          this.page++;
          if (this.page === 1) {
            return {
              Contents: [{ Key: 'sys/2026/05/19/00-call-a.json' }],
              IsTruncated: true,
              NextContinuationToken: 'tok-2',
            };
          }
          return { Contents: [{ Key: 'sys/2026/05/19/00-call-b.json' }], IsTruncated: false };
        }
        if (cmd.name === 'GetObjectCommand') {
          return { Body: { transformToString: async () => JSON.stringify(sampleEntry) } };
        }
        return {};
      }
    }
    const client = new PaginatingS3Client();
    const backend = new S3StorageBackend(
      { type: 's3', bucket: 'b', region: 'eu-west-1' },
      {
        sdk: {
          S3Client: PaginatingS3Client as never,
          PutObjectCommand: PutObjectCommand as never,
          GetObjectCommand: GetObjectCommand as never,
          ListObjectsV2Command: ListObjectsV2Command as never,
        },
        client: client as never,
      },
    );
    const out = [];
    for await (const entry of backend.list({ systemId: 'sys' })) {
      out.push(entry);
    }
    expect(out).toHaveLength(2);
    const listCalls = client.sent.filter((c) => c.name === 'ListObjectsV2Command');
    expect(listCalls).toHaveLength(2);
    expect(listCalls[1]!.input.ContinuationToken).toBe('tok-2');
  });
});
