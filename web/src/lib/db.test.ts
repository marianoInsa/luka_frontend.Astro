import { afterEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from './db';

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(async () => {
  await closeDb();
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe('getDb', () => {
  it('is importable and returns a lazy singleton without opening a connection', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/luka';
    const first = getDb();
    expect(getDb()).toBe(first);
  });

  it('creates a new client after closeDb', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/luka';
    const first = getDb();
    await closeDb();
    expect(getDb()).not.toBe(first);
  });

  it('throws a clear error when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => getDb()).toThrow(/DATABASE_URL/);
  });

  it('closeDb without an active client is a no-op', async () => {
    await expect(closeDb()).resolves.toBeUndefined();
  });
});
