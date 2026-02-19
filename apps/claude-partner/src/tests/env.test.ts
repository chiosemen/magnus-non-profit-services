import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from '../config/env';

test('loadEnv fails when ANTHROPIC_API_KEY missing', () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  const prevDb = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    delete process.env.ANTHROPIC_API_KEY;
    assert.throws(() => loadEnv(), /Missing required env var: ANTHROPIC_API_KEY/);
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    else delete process.env.ANTHROPIC_API_KEY;
    if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
    else delete process.env.DATABASE_URL;
  }
});

