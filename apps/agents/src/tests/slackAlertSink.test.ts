import test from 'node:test';
import assert from 'node:assert/strict';
import { SlackAlertSink, SlackSendError } from '../sinks/SlackAlertSink';
import type { AlertEvent } from '../contracts/events';

const testEvent: AlertEvent = {
  agentName: 'ComplianceWatchdog',
  scopeType: 'org',
  scopeId: 'org-123',
  severity: 'HIGH',
  type: 'FILING_OVERDUE',
  title: 'Form 990 Filing Overdue',
  body: 'The Form 990 filing deadline has passed.',
  recommendedActions: ['File immediately', 'Contact accountant'],
  dedupeKey: 'ComplianceWatchdog:org:org-123:FILING_OVERDUE:2026-03-08',
};

test('SlackAlertSink rejects invalid webhook URL', () => {
  assert.throws(
    () => new SlackAlertSink({ webhookUrl: 'https://example.com/webhook' }),
    /SLACK_WEBHOOK_URL must be a valid Slack webhook URL/
  );
});

test('SlackAlertSink rejects empty webhook URL', () => {
  assert.throws(
    () => new SlackAlertSink({ webhookUrl: '' }),
    /SLACK_WEBHOOK_URL must be a valid Slack webhook URL/
  );
});

test('SlackAlertSink accepts valid Slack webhook URL', () => {
  const sink = new SlackAlertSink({
    webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
  });
  assert.ok(sink);
});

test('SlackSendError captures status code and attempts', () => {
  const err = new SlackSendError('Test error', 429, 3);
  assert.equal(err.name, 'SlackSendError');
  assert.equal(err.statusCode, 429);
  assert.equal(err.attempts, 3);
  assert.equal(err.message, 'Test error');
});
