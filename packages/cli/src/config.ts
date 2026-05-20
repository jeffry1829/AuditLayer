import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import {
  AuditLayerConfigError,
  CLI_DEFAULTS,
  ERROR_CODES,
  FileBackedAuditConfigSchema,
  type FileBackedAuditConfig,
} from '@auditlayer/sdk';

/**
 * CLI's view of an audit config. We narrow to the file-backed subset (no
 * signing closures); the storage backend is the only part the CLI consumes.
 */
export type CliConfig = FileBackedAuditConfig;
export type CliConfigStorage = CliConfig['storage'];
export type CliConfigLocal = Extract<CliConfigStorage, { type: 'local' }>;
export type CliConfigS3 = Extract<CliConfigStorage, { type: 's3' }>;

export const DEFAULT_CONFIG_FILES = CLI_DEFAULTS.configFiles;

export async function loadConfig(explicitPath?: string): Promise<CliConfig | null> {
  const candidates = explicitPath ? [explicitPath] : [...DEFAULT_CONFIG_FILES];
  for (const c of candidates) {
    const p = resolveConfigPath(c, explicitPath !== undefined);
    try {
      const text = await readFile(p, 'utf8');
      const json: unknown = JSON.parse(text);
      const parsed = FileBackedAuditConfigSchema.safeParse(json);
      if (!parsed.success) {
        throw new AuditLayerConfigError(
          ERROR_CODES.CONFIG_INVALID,
          `${p}: config does not match schema: ${parsed.error.issues
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; ')}`,
          { path: p, issues: parsed.error.issues },
        );
      }
      return parsed.data;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      if (err instanceof AuditLayerConfigError) throw err;
      throw new AuditLayerConfigError(
        ERROR_CODES.CONFIG_INVALID,
        `Failed to read config ${p}: ${(err as Error).message}`,
        { path: p },
      );
    }
  }
  return null;
}

function resolveConfigPath(candidate: string, explicit: boolean): string {
  // Default candidates are file basenames we generated — resolve under cwd.
  // Explicit --config values may be absolute or relative to cwd; we reject
  // explicit paths containing ".." segments to discourage casual traversal.
  if (!explicit) return resolve(process.cwd(), candidate);
  if (candidate.split(/[/\\]/).includes('..')) {
    throw new AuditLayerConfigError(
      ERROR_CODES.CONFIG_INVALID,
      `--config must not contain '..' segments (got ${JSON.stringify(candidate)})`,
      { received: candidate },
    );
  }
  return isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
}

export interface ConfigOverrides {
  systemId?: string;
  storageDir?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3Prefix?: string;
}

export function resolveConfig(config: CliConfig | null, overrides: ConfigOverrides): CliConfig {
  const systemId = overrides.systemId ?? config?.systemId;
  if (!systemId) {
    throw new AuditLayerConfigError(
      ERROR_CODES.CONFIG_MISSING_FIELD,
      'systemId is required. Set it in auditlayer.config.json or pass --system-id.',
      { field: 'systemId' },
    );
  }

  let storage: CliConfigStorage | undefined = config?.storage;
  if (overrides.s3Bucket || overrides.s3Region) {
    const existingS3 = storage?.type === 's3' ? storage : undefined;
    const merged: CliConfigS3 = {
      type: 's3',
      bucket: overrides.s3Bucket ?? existingS3?.bucket ?? '',
      region: overrides.s3Region ?? existingS3?.region ?? '',
      prefix: overrides.s3Prefix ?? existingS3?.prefix,
    };
    if (!merged.bucket || !merged.region) {
      throw new AuditLayerConfigError(
        ERROR_CODES.CONFIG_MISSING_FIELD,
        'S3 storage requires both --s3-bucket and --s3-region (or in config).',
        { field: 's3.bucket|s3.region' },
      );
    }
    storage = merged;
  } else if (overrides.storageDir) {
    storage = { type: 'local', dir: overrides.storageDir };
  }
  if (!storage) {
    throw new AuditLayerConfigError(
      ERROR_CODES.CONFIG_MISSING_FIELD,
      'storage is required. Configure it or pass --storage-dir / --s3-bucket.',
      { field: 'storage' },
    );
  }
  return { systemId, storage };
}
