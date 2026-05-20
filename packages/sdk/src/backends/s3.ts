import { AuditLogEntrySchema, type AuditLogEntry } from '@auditlayer/schema';

import type { S3StorageConfig } from '../config.js';
import { STORAGE_DEFAULTS } from '../defaults.js';
import { AuditLayerStorageError, ERROR_CODES } from '../errors.js';
import { assertSafePathSegment } from '../util.js';
import type { AppendOptions, QueryOptions, StorageBackend } from './types.js';

type S3Client = {
  send: (cmd: unknown) => Promise<unknown>;
};

type S3Commands = {
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
  ListObjectsV2Command: new (input: Record<string, unknown>) => unknown;
};

interface S3Module {
  S3Client: new (config: Record<string, unknown>) => S3Client;
  PutObjectCommand: S3Commands['PutObjectCommand'];
  GetObjectCommand: S3Commands['GetObjectCommand'];
  ListObjectsV2Command: S3Commands['ListObjectsV2Command'];
}

function loadAwsSdk(): S3Module {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@aws-sdk/client-s3') as S3Module;
    return mod;
  } catch (err) {
    throw new AuditLayerStorageError(
      ERROR_CODES.STORAGE_BACKEND_MISSING_DEP,
      'S3StorageBackend requires the optional peer dependency "@aws-sdk/client-s3". ' +
        `Install it with: pnpm add @aws-sdk/client-s3. Original error: ${(err as Error).message}`,
      { dependency: '@aws-sdk/client-s3' },
    );
  }
}

export interface S3BackendDeps {
  /** Optional injection point for tests / alternate SDK builds. */
  sdk?: S3Module;
  /** Optional pre-constructed client. */
  client?: S3Client;
}

export class S3StorageBackend implements StorageBackend {
  private readonly bucket: string;
  private readonly region: string;
  private readonly prefix: string;
  private readonly client: S3Client;
  private readonly sdk: S3Module;

  constructor(config: S3StorageConfig, deps: S3BackendDeps = {}) {
    this.sdk = deps.sdk ?? loadAwsSdk();
    this.bucket = config.bucket;
    this.region = config.region;
    this.prefix = config.prefix ? config.prefix.replace(/\/$/, '') : '';
    this.client =
      deps.client ??
      new this.sdk.S3Client({
        region: config.region,
        endpoint: config.endpoint,
      });
  }

  async append(entry: AuditLogEntry, opts: AppendOptions): Promise<void> {
    assertSafePathSegment(opts.systemId, 'systemId');
    assertSafePathSegment(entry.callId, 'callId');
    const key = this.keyFor(opts.systemId, entry.callId, new Date(entry.startedAt));
    const body = JSON.stringify(entry);
    await this.client.send(
      new this.sdk.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: STORAGE_DEFAULTS.s3ContentType,
        ChecksumAlgorithm: STORAGE_DEFAULTS.s3ChecksumAlgorithm,
      }),
    );
  }

  async *list(opts: QueryOptions): AsyncIterable<AuditLogEntry> {
    assertSafePathSegment(opts.systemId, 'systemId');
    const prefix = this.prefixFor(opts.systemId);
    let token: string | undefined;
    do {
      const resp = (await this.client.send(
        new this.sdk.ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      )) as {
        Contents?: Array<{ Key?: string }>;
        IsTruncated?: boolean;
        NextContinuationToken?: string;
      };
      const keys = (resp.Contents ?? [])
        .map((c) => c.Key!)
        .filter(Boolean)
        .sort();
      for (const k of keys) {
        const obj = (await this.client.send(
          new this.sdk.GetObjectCommand({ Bucket: this.bucket, Key: k }),
        )) as { Body?: { transformToString?: () => Promise<string> } };
        if (!obj.Body || !obj.Body.transformToString) continue;
        const text = await obj.Body.transformToString();
        for (const line of text.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(t);
          } catch {
            continue;
          }
          const result = AuditLogEntrySchema.safeParse(parsed);
          if (!result.success) continue;
          const entry = result.data;
          if (opts.caseId && entry.caseId !== opts.caseId) continue;
          if (opts.from && entry.startedAt < opts.from) continue;
          if (opts.to && entry.startedAt > opts.to) continue;
          yield entry;
        }
      }
      token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (token);
  }

  private keyFor(systemId: string, callId: string, when: Date): string {
    const yyyy = when.getUTCFullYear().toString();
    const mm = String(when.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(when.getUTCDate()).padStart(2, '0');
    const hh = String(when.getUTCHours()).padStart(2, '0');
    const segs = [this.prefix, systemId, yyyy, mm, dd, `${hh}-${callId}.json`].filter(Boolean);
    return segs.join('/');
  }

  private prefixFor(systemId: string): string {
    return [this.prefix, systemId].filter(Boolean).join('/') + '/';
  }

  /** Exposed for tests / diagnostics. */
  get region_(): string {
    return this.region;
  }
}
