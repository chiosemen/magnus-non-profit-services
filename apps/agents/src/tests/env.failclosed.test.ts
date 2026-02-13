import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from '../config/env';

test('loadEnv fails closed when DATABASE_URL is missing', () => {
  const prev = process.env.DATABASE_URL;
  try {
    delete process.env.DATABASE_URL;
    assert.throws(() => loadEnv(), /Missing required env var: DATABASE_URL/);
  } finally {
    if (prev !== undefined) process.env.DATABASE_URL = prev;
  }
});

test('loadEnv forbids ConsoleAlertSink in production', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevSink = process.env.AGENTS_ALERT_SINK;
  const prevDb = process.env.DATABASE_URL;
  try {
    process.env.NODE_ENV = 'production';
    process.env.AGENTS_ALERT_SINK = 'console';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    assert.throws(() => loadEnv(), /ConsoleAlertSink is not allowed in production/);
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevSink === undefined) delete process.env.AGENTS_ALERT_SINK;
    else process.env.AGENTS_ALERT_SINK = prevSink;
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
  }
});

