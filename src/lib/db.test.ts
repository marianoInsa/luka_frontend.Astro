import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, getDb } from './db';
import { hyperdriveConnectionString } from './runtime';

vi.mock('./runtime', () => ({ hyperdriveConnectionString: vi.fn() }));

const mockedHyperdrive = vi.mocked(hyperdriveConnectionString);

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(async () => {
  await closeDb();
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe('getDb without Hyperdrive', () => {
  beforeEach(() => {
    mockedHyperdrive.mockReset();
  });

  it('is importable and returns a lazy singleton without opening a connection', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/luka';
    const first = getDb();
    expect(mockedHyperdrive).toHaveBeenCalled();
    expect(first.options.host).toEqual(['localhost']);
    expect(first.options.prepare).toBe(false);
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

describe('getDb with Hyperdrive', () => {
  beforeEach(() => {
    mockedHyperdrive.mockReturnValue('postgres://hyper:pass@hyperdrive.internal:5432/luka');
  });

  it('builds a fresh client per call with the binding connection string and options', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/luka';

    const first = getDb();
    const second = getDb();

    expect(second).not.toBe(first);
    expect(first.options.host).toEqual(['hyperdrive.internal']);
    expect(first.options.max).toBe(5);
    expect(first.options.fetch_types).toBe(false);
    expect(first.options.prepare).toBe(true);
  });

  it('does not require DATABASE_URL when the binding is present', () => {
    delete process.env.DATABASE_URL;
    expect(() => getDb()).not.toThrow();
  });
});
