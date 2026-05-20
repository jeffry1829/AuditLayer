import {
  AuditLayerConfigError,
  ERROR_CODES,
  LocalStorageBackend,
  S3StorageBackend,
  type StorageBackend,
} from '@auditlayer/sdk';

import type { CliConfigStorage } from './config.js';

export function createBackend(storage: CliConfigStorage): StorageBackend {
  switch (storage.type) {
    case 'local':
      return new LocalStorageBackend({
        type: 'local',
        dir: storage.dir,
        rotateBy: storage.rotateBy,
      });
    case 's3':
      return new S3StorageBackend({
        type: 's3',
        bucket: storage.bucket,
        region: storage.region,
        prefix: storage.prefix,
        endpoint: storage.endpoint,
      });
    default: {
      const _exhaustive: never = storage;
      void _exhaustive;
      throw new AuditLayerConfigError(
        ERROR_CODES.CONFIG_UNKNOWN_BACKEND,
        'createBackend: unknown storage type',
        { received: storage },
      );
    }
  }
}
