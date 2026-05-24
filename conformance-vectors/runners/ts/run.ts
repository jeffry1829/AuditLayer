/**
 * TypeScript conformance runner — also the reference vector generator.
 *
 * Modes (decided by `process.argv[2]`):
 *   verify        — load each cases/*.json, ensure each has `canonical` + `sha256`
 *                   and that the SDK reproduces them. Default mode in CI.
 *   generate      — run canonicalize + sha256 over each case's `input`, write
 *                   the result back to the file as `canonical` + `sha256`.
 *                   Used when adding new vectors or after a TS-reference
 *                   schema change (which requires a schemaVersion bump).
 *
 * The TS implementation is the reference; the values written by
 * `generate` are what the Python runner asserts against.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalize } from '@vouchrail/schema';

interface VectorFile {
  name: string;
  description: string;
  input: unknown;
  canonical?: string;
  sha256?: string;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const casesDir = join(here, '..', '..', 'cases');

function loadCases(): Array<{ path: string; vector: VectorFile }> {
  const files = readdirSync(casesDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((f) => {
    const path = join(casesDir, f);
    const vector = JSON.parse(readFileSync(path, 'utf8')) as VectorFile;
    return { path, vector };
  });
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function generate(): number {
  let count = 0;
  for (const { path, vector } of loadCases()) {
    const canonical = canonicalize(vector.input);
    const sha256 = sha256Hex(canonical);
    const updated: VectorFile = { ...vector, canonical, sha256 };
    writeFileSync(path, JSON.stringify(updated, null, 2) + '\n', 'utf8');
    process.stdout.write(`generated ${vector.name}\n`);
    count++;
  }
  process.stdout.write(`Wrote ${count} vectors.\n`);
  return 0;
}

function verify(): number {
  let failed = 0;
  let passed = 0;
  for (const { vector } of loadCases()) {
    if (!vector.canonical || !vector.sha256) {
      process.stderr.write(`${vector.name}: missing canonical/sha256; run 'generate' first.\n`);
      failed++;
      continue;
    }
    const canonical = canonicalize(vector.input);
    const sha256 = sha256Hex(canonical);
    if (canonical !== vector.canonical || sha256 !== vector.sha256) {
      failed++;
      process.stderr.write(
        `FAIL ${vector.name}\n` +
          `  expected canonical: ${vector.canonical}\n` +
          `  got      canonical: ${canonical}\n` +
          `  expected sha256:    ${vector.sha256}\n` +
          `  got      sha256:    ${sha256}\n`,
      );
    } else {
      passed++;
    }
  }
  if (failed === 0) {
    process.stdout.write(`TS conformance: ${passed} passed.\n`);
    return 0;
  }
  process.stderr.write(`TS conformance: ${failed} failed, ${passed} passed.\n`);
  return 1;
}

const mode = process.argv[2] ?? 'verify';
const code = mode === 'generate' ? generate() : verify();
process.exit(code);
