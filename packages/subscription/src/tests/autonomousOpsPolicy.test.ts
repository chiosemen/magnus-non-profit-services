import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionAllowsScheduledAgent } from '../autonomousOpsPolicy';

test('STARTER never schedules agents', () => {
  assert.equal(
    subscriptionAllowsScheduledAgent({
      tier: 'STARTER',
      status: 'ACTIVE',
      agentName: 'ComplianceWatchdog',
    }),
    false,
  );
});

test('non-ACTIVE never schedules agents', () => {
  assert.equal(
    subscriptionAllowsScheduledAgent({
      tier: 'ENTERPRISE',
      status: 'PAST_DUE',
      agentName: 'ComplianceWatchdog',
    }),
    false,
  );
});

test('GROWTH runs assisted agents only', () => {
  assert.equal(
    subscriptionAllowsScheduledAgent({
      tier: 'GROWTH',
      status: 'ACTIVE',
      agentName: 'ComplianceWatchdog',
    }),
    true,
  );
  assert.equal(
    subscriptionAllowsScheduledAgent({
      tier: 'GROWTH',
      status: 'ACTIVE',
      agentName: 'BoardIntelligenceOracle',
    }),
    true,
  );
  assert.equal(
    subscriptionAllowsScheduledAgent({
      tier: 'GROWTH',
      status: 'ACTIVE',
      agentName: 'FinancialSentinel',
    }),
    false,
  );
  assert.equal(
    subscriptionAllowsScheduledAgent({
      tier: 'GROWTH',
      status: 'ACTIVE',
      agentName: 'GrantLifecycleManager',
    }),
    false,
  );
});

test('ENTERPRISE runs nonprofit HQ agent set', () => {
  for (const agentName of [
    'ComplianceWatchdog',
    'BoardIntelligenceOracle',
    'FinancialSentinel',
    'GrantLifecycleManager',
  ] as const) {
    assert.equal(
      subscriptionAllowsScheduledAgent({
        tier: 'ENTERPRISE',
        status: 'ACTIVE',
        agentName,
      }),
      true,
    );
  }
});

test('worker optimizer is internal/deferred and not scheduled by nonprofit subscription tier', () => {
  assert.equal(
    subscriptionAllowsScheduledAgent({
      tier: 'ENTERPRISE',
      status: 'ACTIVE',
      agentName: 'WorkerIncomeOptimizer',
    }),
    false,
  );
});

test('unknown agent name is fail-closed', () => {
  assert.equal(
    subscriptionAllowsScheduledAgent({
      tier: 'ENTERPRISE',
      status: 'ACTIVE',
      agentName: 'NotAnAgent',
    }),
    false,
  );
});
