import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from '../config/env';

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

test('loadEnv fails closed when DATABASE_URL is missing', () => {
  withEnv({ DATABASE_URL: undefined }, () => {
    assert.throws(() => loadEnv(), /Missing required env var: DATABASE_URL/);
  });
});

test('loadEnv forbids ConsoleAlertSink in production', () => {
  withEnv({
    NODE_ENV: 'production',
    AGENTS_ALERT_SINK: 'console',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  }, () => {
    assert.throws(() => loadEnv(), /ConsoleAlertSink is not allowed in production/);
  });
});

test('loadEnv rejects invalid sink type', () => {
  withEnv({
    NODE_ENV: 'development',
    AGENTS_ALERT_SINK: 'invalid',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  }, () => {
    assert.throws(() => loadEnv(), /Invalid AGENTS_ALERT_SINK/);
  });
});

test('loadEnv requires SLACK_WEBHOOK_URL for slack sink', () => {
  withEnv({
    NODE_ENV: 'development',
    AGENTS_ALERT_SINK: 'slack',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    SLACK_WEBHOOK_URL: undefined,
  }, () => {
    assert.throws(() => loadEnv(), /SLACK_WEBHOOK_URL is required/);
  });
});

test('loadEnv requires SLACK_WEBHOOK_URL for fallback sink', () => {
  withEnv({
    NODE_ENV: 'development',
    AGENTS_ALERT_SINK: 'fallback',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    SLACK_WEBHOOK_URL: undefined,
  }, () => {
    assert.throws(() => loadEnv(), /SLACK_WEBHOOK_URL is required/);
  });
});

test('loadEnv rejects invalid SLACK_WEBHOOK_URL format', () => {
  withEnv({
    NODE_ENV: 'development',
    AGENTS_ALERT_SINK: 'slack',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    SLACK_WEBHOOK_URL: 'https://example.com/webhook',
  }, () => {
    assert.throws(() => loadEnv(), /SLACK_WEBHOOK_URL must be a valid Slack webhook URL/);
  });
});

test('loadEnv accepts valid slack configuration', () => {
  withEnv({
    NODE_ENV: 'development',
    AGENTS_ALERT_SINK: 'slack',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T00/B00/xxx',
  }, () => {
    const env = loadEnv();
    assert.equal(env.AGENTS_ALERT_SINK, 'slack');
    assert.equal(env.SLACK_WEBHOOK_URL, 'https://hooks.slack.com/services/T00/B00/xxx');
  });
});

test('loadEnv accepts valid fallback configuration', () => {
  withEnv({
    NODE_ENV: 'development',
    AGENTS_ALERT_SINK: 'fallback',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T00/B00/xxx',
    SLACK_MAX_RETRIES: '5',
  }, () => {
    const env = loadEnv();
    assert.equal(env.AGENTS_ALERT_SINK, 'fallback');
    assert.equal(env.SLACK_MAX_RETRIES, 5);
  });
});

test('loadEnv uses default SLACK_MAX_RETRIES', () => {
  withEnv({
    NODE_ENV: 'development',
    AGENTS_ALERT_SINK: 'slack',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T00/B00/xxx',
    SLACK_MAX_RETRIES: undefined,
  }, () => {
    const env = loadEnv();
    assert.equal(env.SLACK_MAX_RETRIES, 3);
  });
});

test('loadEnv rejects invalid SLACK_MAX_RETRIES', () => {
  withEnv({
    NODE_ENV: 'development',
    AGENTS_ALERT_SINK: 'slack',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T00/B00/xxx',
    SLACK_MAX_RETRIES: 'not-a-number',
  }, () => {
    assert.throws(() => loadEnv(), /Invalid integer for env var: SLACK_MAX_RETRIES/);
  });
});

