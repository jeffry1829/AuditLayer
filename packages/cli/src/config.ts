import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

export interface CliConfigLocal {
  type: 'local';
  dir: string;
  rotateBy?: 'hour' | 'day';
}

export interface CliConfigS3 {
  type: 's3';
  bucket: string;
  region: string;
  prefix?: string;
  endpoint?: string;
}

export type CliConfigStorage = CliConfigLocal | CliConfigS3;

export interface CliConfig {
  systemId: string;
  storage: CliConfigStorage;
}

export const DEFAULT_CONFIG_FILES = ['auditlayer.config.json', '.auditlayer.json'] as const;

export async function loadConfig(explicitPath?: string): Promise<CliConfig | null> {
  const candidates = explicitPath ? [explicitPath] : [...DEFAULT_CONFIG_FILES];
  for (const c of candidates) {
    const p = resolveConfigPath(c, explicitPath !== undefined);
    try {
      const text = await readFile(p, 'utf8');
      const json = JSON.parse(text) as CliConfig;
      validate(json, p);
      return json;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new Error(`Failed to read config ${p}: ${(err as Error).message}`);
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
    throw new Error(`--config must not contain '..' segments (got ${JSON.stringify(candidate)})`);
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
    throw new Error('systemId is required. Set it in auditlayer.config.json or pass --system-id.');
  }

  let storage: CliConfigStorage | undefined = config?.storage;
  if (overrides.s3Bucket || overrides.s3Region) {
    storage = {
      type: 's3',
      bucket: overrides.s3Bucket ?? (storage?.type === 's3' ? storage.bucket : ''),
      region: overrides.s3Region ?? (storage?.type === 's3' ? storage.region : ''),
      prefix: overrides.s3Prefix ?? (storage?.type === 's3' ? storage.prefix : undefined),
    };
    if (!('bucket' in storage) || !storage.bucket || !storage.region) {
      throw new Error('S3 storage requires both --s3-bucket and --s3-region (or in config).');
    }
  } else if (overrides.storageDir) {
    storage = { type: 'local', dir: overrides.storageDir };
  }
  if (!storage) {
    throw new Error('storage is required. Configure it or pass --storage-dir / --s3-bucket.');
  }
  return { systemId, storage };
}

function validate(c: unknown, where: string): asserts c is CliConfig {
  if (!c || typeof c !== 'object') throw new Error(`${where}: not an object`);
  const cfg = c as Partial<CliConfig>;
  if (!cfg.systemId || typeof cfg.systemId !== 'string') {
    throw new Error(`${where}: systemId is required`);
  }
  if (!cfg.storage || typeof cfg.storage !== 'object') {
    throw new Error(`${where}: storage is required`);
  }
  const s = cfg.storage as CliConfigStorage;
  if (s.type === 'local') {
    if (!s.dir) throw new Error(`${where}: storage.dir is required for local backend`);
  } else if (s.type === 's3') {
    if (!s.bucket || !s.region) {
      throw new Error(`${where}: storage.bucket and storage.region are required for s3 backend`);
    }
  } else {
    throw new Error(`${where}: storage.type must be 'local' or 's3'`);
  }
}
