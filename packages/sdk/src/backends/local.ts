import { createReadStream, existsSync } from 'node:fs';
import { mkdir, appendFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { AuditLogEntrySchema, type AuditLogEntry } from '@auditlayer/schema';

import type { LocalStorageConfig } from '../config.js';
import { assertSafePathSegment } from '../util.js';
import type { AppendOptions, QueryOptions, StorageBackend } from './types.js';

export class LocalStorageBackend implements StorageBackend {
  private readonly dir: string;
  private readonly rotateBy: 'hour' | 'day';

  constructor(config: LocalStorageConfig) {
    this.dir = config.dir;
    this.rotateBy = config.rotateBy ?? 'hour';
  }

  async append(entry: AuditLogEntry, opts: AppendOptions): Promise<void> {
    assertSafePathSegment(opts.systemId, 'systemId');
    const path = this.pathFor(opts.systemId, new Date(entry.startedAt));
    await mkdir(join(this.dir, opts.systemId, ...path.dirSegments), { recursive: true });
    await appendFile(path.fullPath, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  async *list(opts: QueryOptions): AsyncIterable<AuditLogEntry> {
    assertSafePathSegment(opts.systemId, 'systemId');
    const systemRoot = join(this.dir, opts.systemId);
    if (!existsSync(systemRoot)) return;
    const allFiles = await this.collectFiles(systemRoot);
    allFiles.sort();
    for (const file of allFiles) {
      const stream = createReadStream(file, { encoding: 'utf8' });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch (err) {
          process.emitWarning(
            `LocalStorageBackend: malformed JSON in ${file} — skipping line (${(err as Error).message})`,
            { code: 'AUDITLAYER_BAD_JSON' },
          );
          continue;
        }
        const result = AuditLogEntrySchema.safeParse(parsed);
        if (!result.success) {
          process.emitWarning(
            `LocalStorageBackend: entry failed schema validation in ${file} — skipping`,
            { code: 'AUDITLAYER_BAD_SCHEMA' },
          );
          continue;
        }
        const entry = result.data;
        if (opts.caseId && entry.caseId !== opts.caseId) continue;
        if (opts.from && entry.startedAt < opts.from) continue;
        if (opts.to && entry.startedAt > opts.to) continue;
        yield entry;
      }
    }
  }

  private pathFor(systemId: string, when: Date): { fullPath: string; dirSegments: string[] } {
    const yyyy = when.getUTCFullYear().toString();
    const mm = String(when.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(when.getUTCDate()).padStart(2, '0');
    const hh = String(when.getUTCHours()).padStart(2, '0');
    const dirSegments = [yyyy, mm, dd];
    const fileName = this.rotateBy === 'hour' ? `${hh}.jsonl` : 'day.jsonl';
    const fullPath = join(this.dir, systemId, yyyy, mm, dd, fileName);
    return { fullPath, dirSegments };
  }

  private async collectFiles(root: string): Promise<string[]> {
    const out: string[] = [];
    async function walk(p: string) {
      const items = await readdir(p, { withFileTypes: true });
      for (const item of items) {
        const next = join(p, item.name);
        if (item.isDirectory()) {
          await walk(next);
        } else if (item.isFile() && item.name.endsWith('.jsonl')) {
          out.push(next);
        }
      }
    }
    await walk(root);
    return out;
  }
}
