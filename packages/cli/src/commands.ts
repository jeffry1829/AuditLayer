import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  AuditLogEntrySchema,
  verifyChain,
  type AuditLogEntry,
  type ChainVerificationResult,
} from '@auditlayer/schema';
import {
  AuditLayerConfigError,
  AuditLayerSchemaError,
  CLI_DEFAULTS,
  ERROR_CODES,
} from '@auditlayer/sdk';

import { createBackend } from './backend-factory.js';
import type { CliConfig } from './config.js';

function validateIsoBound(value: string | undefined, label: string): void {
  if (value === undefined) return;
  const t = Date.parse(value);
  if (Number.isNaN(t)) {
    throw new AuditLayerSchemaError(
      ERROR_CODES.SCHEMA_INVALID_TIMESTAMP,
      `${label} must be an ISO-8601 timestamp (got ${JSON.stringify(value)})`,
      { label, value },
    );
  }
}

function validateRange(from: string | undefined, to: string | undefined): void {
  validateIsoBound(from, '--from');
  validateIsoBound(to, '--to');
  if (from && to && Date.parse(from) > Date.parse(to)) {
    throw new AuditLayerConfigError(
      ERROR_CODES.CONFIG_INVALID,
      `--from (${from}) must not be after --to (${to}).`,
      { from, to },
    );
  }
}

export interface CommandIO {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
}

export const defaultIO: CommandIO = {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
};

const DEFAULT_INIT_CONFIG = CLI_DEFAULTS.initConfigTemplate;

export interface InitOptions {
  output?: string;
  force?: boolean;
}

export async function initCommand(opts: InitOptions, io: CommandIO = defaultIO): Promise<number> {
  const path = resolve(io.cwd, opts.output ?? CLI_DEFAULTS.initOutputPath);
  try {
    await writeFile(path, JSON.stringify(DEFAULT_INIT_CONFIG, null, 2) + '\n', {
      encoding: 'utf8',
      flag: opts.force ? 'w' : 'wx',
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      io.stderr.write(`Refusing to overwrite ${path}. Use --force to overwrite.\n`);
      return 2;
    }
    throw err;
  }
  io.stdout.write(`Wrote config to ${path}\n`);
  return 0;
}

export interface QueryOptions {
  caseId: string;
  from?: string;
  to?: string;
  json?: boolean;
}

export async function queryCommand(
  config: CliConfig,
  opts: QueryOptions,
  io: CommandIO = defaultIO,
): Promise<number> {
  if (!opts.caseId || !opts.caseId.trim()) {
    io.stderr.write('query: --case-id is required and must be non-empty.\n');
    return 2;
  }
  validateRange(opts.from, opts.to);
  const backend = createBackend(config.storage);
  let count = 0;
  for await (const entry of backend.list({
    systemId: config.systemId,
    caseId: opts.caseId,
    from: opts.from,
    to: opts.to,
  })) {
    if (opts.json) {
      io.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      io.stdout.write(formatEntry(entry));
    }
    count++;
  }
  io.stderr.write(`Matched ${entryCount(count)} for case ${opts.caseId}.\n`);
  await backend.close?.();
  return 0;
}

export interface VerifyOptions {
  from?: string;
  to?: string;
  caseId?: string;
  json?: boolean;
}

export async function verifyCommand(
  config: CliConfig,
  opts: VerifyOptions,
  io: CommandIO = defaultIO,
): Promise<number> {
  validateRange(opts.from, opts.to);
  const backend = createBackend(config.storage);
  const entries: AuditLogEntry[] = [];
  for await (const e of backend.list({
    systemId: config.systemId,
    caseId: opts.caseId,
    from: opts.from,
    to: opts.to,
  })) {
    entries.push(AuditLogEntrySchema.parse(e));
  }
  const result: ChainVerificationResult = verifyChain(entries);
  if (opts.json) {
    io.stdout.write(
      JSON.stringify({
        systemId: config.systemId,
        entriesChecked: entries.length,
        result,
      }) + '\n',
    );
  } else {
    if (result.valid) {
      io.stdout.write(`✔ Chain valid. ${entryCount(entries.length)} verified.\n`);
    } else {
      io.stdout.write(`✘ Chain INVALID at index ${result.brokenAt}.\n`);
      io.stdout.write(`  reason: ${result.reason}\n`);
      if (result.detail) io.stdout.write(`  detail: ${result.detail}\n`);
    }
  }
  await backend.close?.();
  return result.valid ? 0 : 1;
}

export interface ExportOptions {
  caseId?: string;
  from?: string;
  to?: string;
  output?: string;
}

export async function exportCommand(
  config: CliConfig,
  opts: ExportOptions,
  io: CommandIO = defaultIO,
): Promise<number> {
  if (!opts.caseId && !opts.from && !opts.to) {
    io.stderr.write('export: pass --case-id or --from/--to to bound the export.\n');
    return 2;
  }
  validateRange(opts.from, opts.to);
  const backend = createBackend(config.storage);
  const dest = opts.output
    ? createWriteStream(resolve(io.cwd, opts.output), { flags: 'w', encoding: 'utf8' })
    : null;
  const out = dest ?? io.stdout;

  let streamError: Error | null = null;
  if (dest) {
    dest.on('error', (err) => {
      streamError = err instanceof Error ? err : new Error(String(err));
    });
  }

  let count = 0;
  try {
    for await (const entry of backend.list({
      systemId: config.systemId,
      caseId: opts.caseId,
      from: opts.from,
      to: opts.to,
    })) {
      if (streamError) break;
      out.write(JSON.stringify(entry) + '\n');
      count++;
    }
  } finally {
    if (dest) await new Promise<void>((res) => dest.end(res));
    await backend.close?.();
  }
  if (streamError) {
    io.stderr.write(`export: write failed: ${(streamError as Error).message}\n`);
    return 1;
  }
  io.stderr.write(`Wrote ${count} entries to ${opts.output ?? 'stdout'}\n`);
  return 0;
}

function entryCount(n: number): string {
  return `${n} entr${n === 1 ? 'y' : 'ies'}`;
}

function formatEntry(entry: AuditLogEntry): string {
  const reasons = entry.reasonCodes?.length ? ` reasons=${entry.reasonCodes.join(',')}` : '';
  const human = entry.humanReview ? ` review=${entry.humanReview.decision}` : '';
  const risk = entry.riskFlags?.length ? ` risk=${entry.riskFlags.join(',')}` : '';
  return (
    `${entry.startedAt} ${entry.callId.slice(0, 8)} case=${entry.caseId} ` +
    `model=${entry.modelProvider}/${entry.modelName}@${entry.modelVersion}` +
    `${reasons}${human}${risk}\n`
  );
}
