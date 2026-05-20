import { createHash, randomBytes } from 'node:crypto';

import type { PiiRedactionConfig } from './config.js';
import { PII_DEFAULTS } from './defaults.js';
import { AuditLayerPiiError, ERROR_CODES } from './errors.js';
import {
  ALL_PII_PATTERN_NAMES,
  DEFAULT_ENABLED_PII_PATTERNS,
  DEFAULT_PII_PATTERNS,
  PII_PATTERN_REGISTRY,
  type PiiPatternName,
} from './pii-patterns.js';

export {
  ALL_PII_PATTERN_NAMES,
  DEFAULT_ENABLED_PII_PATTERNS,
  DEFAULT_PII_PATTERNS,
  PII_PATTERN_REGISTRY,
  type PiiPatternName,
};

export interface PiiTokenStore {
  /** Insert or look up the token for a literal PII value within a given case. */
  getOrCreateToken(caseId: string, fieldKey: string, value: string): Promise<string> | string;
  /** Retrieve a value by token, used only for justified reveal flows. */
  reveal(token: string): Promise<string | null> | (string | null);
  /** Delete all tokens for a case (GDPR erasure). */
  eraseCase(caseId: string): Promise<void> | void;
  /** Optional resource cleanup. */
  close?(): void | Promise<void>;
}

function mintPseudonym(): string {
  return `${PII_DEFAULTS.pseudonymPrefix}:${randomBytes(PII_DEFAULTS.pseudonymRandomBytes).toString('hex')}`;
}

function compositeKey(caseId: string, fieldKey: string, value: string): string {
  // The 0x1F (Unit Separator) byte cannot appear in any of the inputs we
  // accept and is therefore a safe internal delimiter even if caseId or value
  // contain "::".
  const d = PII_DEFAULTS.compositeDelimiter;
  return `${caseId}${d}${fieldKey}${d}${value}`;
}

/**
 * In-memory token store. Single-process only; no cross-process consistency
 * guarantees. Suitable for tests and short-lived demos. Production deployments
 * should use SqlitePiiTokenStore (or a customer-supplied PiiTokenStore).
 */
export class InMemoryPiiTokenStore implements PiiTokenStore {
  // forward key -> token
  private readonly forward = new Map<string, string>();
  // token -> { caseId, fieldKey, value } so eraseCase reverses precisely.
  private readonly reverse = new Map<
    string,
    { caseId: string; forwardKey: string; value: string }
  >();
  // caseId -> set of tokens
  private readonly caseIndex = new Map<string, Set<string>>();

  getOrCreateToken(caseId: string, fieldKey: string, value: string): string {
    const forwardKey = compositeKey(caseId, fieldKey, value);
    const existing = this.forward.get(forwardKey);
    if (existing) return existing;
    const token = mintPseudonym();
    this.forward.set(forwardKey, token);
    this.reverse.set(token, { caseId, forwardKey, value });
    let set = this.caseIndex.get(caseId);
    if (!set) {
      set = new Set();
      this.caseIndex.set(caseId, set);
    }
    set.add(token);
    return token;
  }

  reveal(token: string): string | null {
    return this.reverse.get(token)?.value ?? null;
  }

  eraseCase(caseId: string): void {
    const tokens = this.caseIndex.get(caseId);
    if (!tokens) return;
    for (const t of tokens) {
      const meta = this.reverse.get(t);
      if (meta) this.forward.delete(meta.forwardKey);
      this.reverse.delete(t);
    }
    this.caseIndex.delete(caseId);
  }
}

/**
 * SQLite-backed token store. `better-sqlite3` is an optional peer dep; if the
 * customer enables the SQLite store they must install it.
 */
export class SqlitePiiTokenStore implements PiiTokenStore {
  // The type is `unknown` to keep `better-sqlite3` truly optional.
  private readonly db: {
    prepare: (sql: string) => {
      run: (...args: unknown[]) => unknown;
      get: (...args: unknown[]) => unknown;
      all: (...args: unknown[]) => unknown[];
    };
    exec: (sql: string) => void;
    close: () => void;
  };

  constructor(path: string) {
    let Database: new (path: string) => SqlitePiiTokenStore['db'];
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Database = require('better-sqlite3');
    } catch (err) {
      throw new AuditLayerPiiError(
        ERROR_CODES.PII_TOKEN_STORE_MISSING_DEP,
        'SqlitePiiTokenStore requires the optional peer dependency "better-sqlite3". ' +
          `Install it with: pnpm add better-sqlite3. Original error: ${(err as Error).message}`,
        { dependency: 'better-sqlite3' },
      );
    }
    this.db = new Database(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pii_tokens (
        case_id TEXT NOT NULL,
        field_key TEXT NOT NULL,
        value TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (case_id, field_key, value)
      );
      CREATE INDEX IF NOT EXISTS idx_pii_token ON pii_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_pii_case ON pii_tokens(case_id);
    `);
  }

  getOrCreateToken(caseId: string, fieldKey: string, value: string): string {
    const existing = this.db
      .prepare('SELECT token FROM pii_tokens WHERE case_id = ? AND field_key = ? AND value = ?')
      .get(caseId, fieldKey, value) as { token: string } | undefined;
    if (existing) return existing.token;
    const token = mintPseudonym();
    this.db
      .prepare(
        'INSERT INTO pii_tokens (case_id, field_key, value, token, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(caseId, fieldKey, value, token, new Date().toISOString());
    return token;
  }

  reveal(token: string): string | null {
    const row = this.db.prepare('SELECT value FROM pii_tokens WHERE token = ?').get(token) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  }

  eraseCase(caseId: string): void {
    this.db.prepare('DELETE FROM pii_tokens WHERE case_id = ?').run(caseId);
  }

  close(): void {
    this.db.close();
  }
}

/** Compute a SHA-256 hex digest of a string. */
export function hashString(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Detect PII matches across enabled patterns. Returns matches with their pattern name. */
export function detectPii(
  text: string,
  enabledPatterns: Partial<Record<PiiPatternName, boolean>> = {},
  customPatterns: Record<string, RegExp> = {},
): Array<{ patternName: string; match: string; index: number }> {
  const results: Array<{ patternName: string; match: string; index: number }> = [];
  for (const name of ALL_PII_PATTERN_NAMES) {
    if (!enabledPatterns[name]) continue;
    pushMatches(text, PII_PATTERN_REGISTRY[name].regex, name, results);
  }
  for (const [name, regex] of Object.entries(customPatterns)) {
    pushMatches(text, regex, name, results);
  }
  results.sort((a, b) => a.index - b.index);
  return results;
}

function pushMatches(
  text: string,
  regex: RegExp,
  name: string,
  out: Array<{ patternName: string; match: string; index: number }>,
) {
  if (!regex.global) {
    const m = regex.exec(text);
    if (m) out.push({ patternName: name, match: m[0], index: m.index });
    return;
  }
  // Clone the regex to avoid lastIndex contamination across calls.
  const r = new RegExp(regex.source, regex.flags);
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    out.push({ patternName: name, match: m[0], index: m.index });
    if (m.index === r.lastIndex) r.lastIndex++;
  }
}

export class PiiRedactor {
  readonly enabled: boolean;
  readonly strategy: 'pseudonymize' | 'hash' | 'remove';
  private readonly enabledPatterns: Partial<Record<PiiPatternName, boolean>>;
  private readonly customPatterns: Record<string, RegExp>;
  private readonly tokenStore: PiiTokenStore | null;

  constructor(config: PiiRedactionConfig | undefined, tokenStore: PiiTokenStore | null) {
    this.enabled = Boolean(config?.enabled);
    this.strategy = config?.strategy ?? PII_DEFAULTS.strategy;
    this.enabledPatterns = config?.patterns ?? { ...DEFAULT_ENABLED_PII_PATTERNS };
    this.customPatterns = config?.customPatterns ?? {};
    this.tokenStore = tokenStore;
    if (this.enabled && this.strategy === 'pseudonymize' && !this.tokenStore) {
      throw new AuditLayerPiiError(
        ERROR_CODES.PII_TOKEN_STORE_MISSING,
        'PiiRedactor: pseudonymize strategy requires a token store. ' +
          'Configure piiRedaction.tokenStore.',
        { strategy: this.strategy },
      );
    }
  }

  /**
   * Redact PII in a JSON-compatible value. Returns the redacted shape, the
   * set of pattern names that fired, and the parallel pseudonym key map for
   * the audit entry's `inputPiiRedacted` field.
   */
  async redact(
    value: unknown,
    caseId: string,
  ): Promise<{
    redacted: unknown;
    fieldsTouched: string[];
    pseudonymKey?: string;
  }> {
    if (!this.enabled) {
      return { redacted: value, fieldsTouched: [] };
    }
    const fieldsTouched = new Set<string>();
    const redacted = await this.walk(value, caseId, 'root', fieldsTouched);
    return {
      redacted,
      fieldsTouched: Array.from(fieldsTouched),
      pseudonymKey: this.strategy === 'pseudonymize' && this.tokenStore ? caseId : undefined,
    };
  }

  private async walk(
    v: unknown,
    caseId: string,
    fieldPath: string,
    fieldsTouched: Set<string>,
  ): Promise<unknown> {
    if (v == null || typeof v === 'boolean' || typeof v === 'number') return v;
    if (typeof v === 'string') {
      return this.redactString(v, caseId, fieldPath, fieldsTouched);
    }
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      for (let i = 0; i < v.length; i++) {
        out.push(await this.walk(v[i], caseId, `${fieldPath}[${i}]`, fieldsTouched));
      }
      return out;
    }
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = await this.walk(val, caseId, `${fieldPath}.${k}`, fieldsTouched);
      }
      return out;
    }
    return v;
  }

  private async redactString(
    text: string,
    caseId: string,
    fieldPath: string,
    fieldsTouched: Set<string>,
  ): Promise<string> {
    const matches = detectPii(text, this.enabledPatterns, this.customPatterns);
    if (matches.length === 0) return text;
    // Replace matches by walking backwards so indices stay valid.
    let out = text;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i]!;
      fieldsTouched.add(`${fieldPath}:${m.patternName}`);
      let replacement: string;
      if (this.strategy === 'remove') {
        replacement = PII_DEFAULTS.removePlaceholder;
      } else if (this.strategy === 'hash') {
        replacement = `${PII_DEFAULTS.hashPrefix}:${hashString(m.match).slice(0, PII_DEFAULTS.hashHexLength)}`;
      } else {
        // pseudonymize — uses token store
        const token = await this.tokenStore!.getOrCreateToken(
          caseId,
          `${fieldPath}:${m.patternName}`,
          m.match,
        );
        replacement = token;
      }
      out = out.slice(0, m.index) + replacement + out.slice(m.index + m.match.length);
    }
    return out;
  }
}
