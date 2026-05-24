import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqlitePiiTokenStore } from '../src/pii.js';

import { mkTmpAuditDir } from './_helpers.js';

describe('SqlitePiiTokenStore', () => {
  let dir: string;
  let dbPath: string;
  beforeEach(() => {
    dir = mkTmpAuditDir('sqlite-');
    dbPath = join(dir, 'pii.sqlite');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists tokens across calls', async () => {
    const store = new SqlitePiiTokenStore(dbPath);
    const t1 = await store.getOrCreateToken('case-1', 'email', 'a@b.com');
    const t2 = await store.getOrCreateToken('case-1', 'email', 'a@b.com');
    expect(t1).toBe(t2);
    expect(t1).toMatch(/^pii:[0-9a-f]{16}$/);
    expect(await store.reveal(t1)).toBe('a@b.com');
    store.close();
  });

  it('survives reopening the database', async () => {
    const store1 = new SqlitePiiTokenStore(dbPath);
    const t = await store1.getOrCreateToken('case-1', 'phone', '+1 555 1234');
    store1.close();
    const store2 = new SqlitePiiTokenStore(dbPath);
    expect(await store2.reveal(t)).toBe('+1 555 1234');
    store2.close();
  });

  it('reveals null for unknown token', async () => {
    const store = new SqlitePiiTokenStore(dbPath);
    expect(await store.reveal('pii:deadbeefdeadbeef')).toBeNull();
    store.close();
  });

  it('eraseCase removes only that case (GDPR scoping)', async () => {
    const store = new SqlitePiiTokenStore(dbPath);
    const tKeep = await store.getOrCreateToken('case-keep', 'email', 'keep@me.com');
    const tDrop = await store.getOrCreateToken('case-drop', 'email', 'drop@me.com');
    store.eraseCase('case-drop');
    expect(await store.reveal(tKeep)).toBe('keep@me.com');
    expect(await store.reveal(tDrop)).toBeNull();
    store.close();
  });
});
