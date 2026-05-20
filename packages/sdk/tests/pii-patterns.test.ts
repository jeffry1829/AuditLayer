import { describe, expect, it } from 'vitest';

import {
  ALL_PII_PATTERN_NAMES,
  DEFAULT_ENABLED_PII_PATTERNS,
  DEFAULT_PII_PATTERNS,
  PII_PATTERN_REGISTRY,
} from '../src/pii-patterns.js';

describe('PII pattern registry', () => {
  it('every registered pattern has a global regex matching its id', () => {
    for (const [name, def] of Object.entries(PII_PATTERN_REGISTRY)) {
      expect(def.id).toBe(name);
      expect(def.regex.flags).toContain('g');
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_PII_PATTERNS shape matches registry keys', () => {
    expect(Object.keys(DEFAULT_PII_PATTERNS).sort()).toEqual(
      Object.keys(PII_PATTERN_REGISTRY).sort(),
    );
  });

  it('DEFAULT_ENABLED_PII_PATTERNS reflects defaultEnabled per pattern', () => {
    for (const [name, def] of Object.entries(PII_PATTERN_REGISTRY)) {
      expect(DEFAULT_ENABLED_PII_PATTERNS[name as keyof typeof PII_PATTERN_REGISTRY]).toBe(
        def.defaultEnabled,
      );
    }
  });

  it('ALL_PII_PATTERN_NAMES is the full key set', () => {
    expect([...ALL_PII_PATTERN_NAMES].sort()).toEqual(Object.keys(PII_PATTERN_REGISTRY).sort());
  });

  it('registry + derived tables are frozen against mutation', () => {
    expect(Object.isFrozen(DEFAULT_PII_PATTERNS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ENABLED_PII_PATTERNS)).toBe(true);
    expect(Object.isFrozen(ALL_PII_PATTERN_NAMES)).toBe(true);
  });

  it('built-in patterns are conservative: name/address/nhsNumber/euNationalId default off', () => {
    expect(DEFAULT_ENABLED_PII_PATTERNS.name).toBe(false);
    expect(DEFAULT_ENABLED_PII_PATTERNS.address).toBe(false);
    expect(DEFAULT_ENABLED_PII_PATTERNS.nhsNumber).toBe(false);
    expect(DEFAULT_ENABLED_PII_PATTERNS.euNationalId).toBe(false);
    expect(DEFAULT_ENABLED_PII_PATTERNS.email).toBe(true);
  });
});
