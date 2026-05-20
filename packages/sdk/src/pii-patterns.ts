/**
 * Single source of truth for built-in PII patterns.
 *
 * Adding a new pattern is a single registry entry — the PII redactor, the
 * config type system, and the default-enabled set all derive from this table.
 *
 * All patterns must be bounded in length so adversarial input cannot trigger
 * catastrophic regex backtracking. The MVP set documented in the schema spec
 * is conservative; custom patterns the caller supplies are their own
 * responsibility (see `PiiRedactionConfig.customPatterns`).
 */

export interface PiiPatternDefinition {
  /** Stable identifier used in config and audit metadata. */
  readonly id: string;
  /** Human description; rendered in docs / errors. */
  readonly description: string;
  /** Compiled regex. MUST be global (g) so detectPii() can iterate matches. */
  readonly regex: RegExp;
  /** Whether the pattern is enabled by default when piiRedaction.enabled is true. */
  readonly defaultEnabled: boolean;
}

/** Registry. Keys are TypeScript-narrowed pattern identifiers. */
export const PII_PATTERN_REGISTRY = {
  email: {
    id: 'email',
    description: 'RFC 5322 style email addresses, bounded length',
    // Bounded local-part and domain length; TLD >= 2 letters.
    regex: /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63}){0,4}\.[A-Za-z]{2,24}/g,
    defaultEnabled: true,
  },
  phone: {
    id: 'phone',
    description: 'International dial-format phone numbers',
    regex: /\+?\d[\d ()-]{6,30}\d/g,
    defaultEnabled: true,
  },
  ssn: {
    id: 'ssn',
    description: 'US Social Security Number (NNN-NN-NNNN)',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    defaultEnabled: true,
  },
  nhsNumber: {
    id: 'nhsNumber',
    description: 'UK NHS Number (10 digits, optional spaces/dashes)',
    regex: /\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/g,
    defaultEnabled: false,
  },
  euNationalId: {
    id: 'euNationalId',
    description: 'EU national identifier (alphanumeric, 1-2 prefix letters)',
    regex: /\b[A-Z]{1,2}\d{6,12}[A-Z]?\b/g,
    defaultEnabled: false,
  },
  ipAddress: {
    id: 'ipAddress',
    description: 'IPv4 dotted-quad',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    defaultEnabled: true,
  },
  creditCard: {
    id: 'creditCard',
    // Bounded total length (~19 digits + 6 separators) to prevent backtracking.
    description: 'Credit/payment card numbers, 13-19 digits with optional separators',
    regex: /\b\d(?:[ -]?\d){12,18}\b/g,
    defaultEnabled: true,
  },
  iban: {
    id: 'iban',
    description: 'IBAN (ISO 13616)',
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,
    defaultEnabled: true,
  },
  name: {
    id: 'name',
    // Naive: capitalized two-token name. Will produce false positives; off by default.
    description: 'Capitalized two-token Western personal name (heuristic)',
    regex: /\b[A-Z][a-z]{1,20} [A-Z][a-z]{1,20}\b/g,
    defaultEnabled: false,
  },
  address: {
    id: 'address',
    // Best-effort numeric-prefixed address line. Bounded repetition.
    description: 'Numeric-prefixed Western street address (heuristic)',
    regex:
      /\b\d{1,5}\s+(?:[A-Z][a-z]{1,20}\s){1,4}(Street|Avenue|Road|Lane|Boulevard|Drive|Court|Place|St|Ave|Rd|Blvd|Dr)\b/g,
    defaultEnabled: false,
  },
} as const satisfies Record<string, PiiPatternDefinition>;

/** Stable identifiers for built-in patterns; derived from the registry. */
export type PiiPatternName = keyof typeof PII_PATTERN_REGISTRY;

/** Default-enabled patterns when piiRedaction.enabled is true and patterns is unspecified. */
export const DEFAULT_ENABLED_PII_PATTERNS: Readonly<Record<PiiPatternName, boolean>> =
  Object.freeze(
    Object.fromEntries(
      (Object.entries(PII_PATTERN_REGISTRY) as Array<[PiiPatternName, PiiPatternDefinition]>).map(
        ([name, def]) => [name, def.defaultEnabled],
      ),
    ) as Record<PiiPatternName, boolean>,
  );

/**
 * Compatibility alias: existing callers (and 3rd parties) imported a
 * `DEFAULT_PII_PATTERNS` map of regexes. Keep the public shape stable while
 * pointing it at the registry.
 */
export const DEFAULT_PII_PATTERNS: Readonly<Record<PiiPatternName, RegExp>> = Object.freeze(
  Object.fromEntries(
    (Object.entries(PII_PATTERN_REGISTRY) as Array<[PiiPatternName, PiiPatternDefinition]>).map(
      ([name, def]) => [name, def.regex],
    ),
  ) as Record<PiiPatternName, RegExp>,
);

/** All registered pattern names. */
export const ALL_PII_PATTERN_NAMES: readonly PiiPatternName[] = Object.freeze(
  Object.keys(PII_PATTERN_REGISTRY) as PiiPatternName[],
);
