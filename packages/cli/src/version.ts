import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageManifest {
  name: string;
  version: string;
}

function locateManifest(): string {
  // dist/version.js → ../package.json after build.
  // src/version.ts → ../package.json under ts-node / vitest as well.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'package.json');
}

const manifest = JSON.parse(readFileSync(locateManifest(), 'utf8')) as PackageManifest;

export const CLI_NAME = manifest.name;
export const CLI_VERSION = manifest.version;
