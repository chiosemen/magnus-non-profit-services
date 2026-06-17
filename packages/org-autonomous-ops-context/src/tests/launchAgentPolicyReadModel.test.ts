import test from 'node:test';
import assert from 'node:assert/strict';
import type { SubscriptionTier } from '@magnus/db/types';
import { subscriptionAllowsScheduledAgent } from '@magnus/subscription';
import type { ScheduledAgentName } from '@magnus/subscription';
import { buildAutonomyPolicySurface, getLaunchAgentPolicyRows } from '../launchAgentPolicyReadModel';

const TIERS: SubscriptionTier[] = ['STARTER', 'GROWTH', 'ENTERPRISE'];

function allowed(tier: SubscriptionTier, agentName: string): boolean {
  return subscriptionAllowsScheduledAgent({ tier, status: 'ACTIVE', agentName });
}

/** Mirrors `packages/subscription/src/autonomousOpsPolicy.ts` — test fails if policy drifts without read-model update. */
const EXPECTED: Record<ScheduledAgentName, Record<SubscriptionTier, boolean>> = {
  ComplianceWatchdog: { STARTER: false, GROWTH: true, ENTERPRISE: true },
  BoardIntelligenceOracle: { STARTER: false, GROWTH: true, ENTERPRISE: true },
  GrantLifecycleManager: { STARTER: false, GROWTH: false, ENTERPRISE: true },
  GrantIntelligenceHerald: { STARTER: false, GROWTH: false, ENTERPRISE: true },
  FinancialSentinel: { STARTER: false, GROWTH: false, ENTERPRISE: true },
  WorkerIncomeOptimizer: { STARTER: false, GROWTH: false, ENTERPRISE: false },
};

test('getLaunchAgentPolicyRows covers every ScheduledAgentName once', () => {
  const rows = getLaunchAgentPolicyRows();
  const names = rows.map(r => r.agentName);
  const unique = new Set(names);
  assert.equal(unique.size, names.length);
  for (const key of Object.keys(EXPECTED) as ScheduledAgentName[]) {
    assert.ok(names.includes(key), `missing row for ${key}`);
  }
});

test('launch agent subscription eligibility matches autonomousOpsPolicy', () => {
  for (const row of getLaunchAgentPolicyRows()) {
    const exp = EXPECTED[row.agentName];
    assert.ok(exp, `no EXPECTED entry for ${row.agentName}`);
    for (const tier of TIERS) {
      assert.equal(
        allowed(tier, row.agentName),
        exp[tier],
        `${row.agentName} tier ${tier}`,
      );
    }
  }
});

test('buildAutonomyPolicySurface includes target vs enforced distinction', () => {
  const s = buildAutonomyPolicySurface();
  assert.ok(s.currentEnforcementSummary.length >= 2);
  assert.ok(s.targetPolicyPointer.includes('accordActionMatrix'));
  assert.ok(s.externalNeverAutonomous.some(l => l.toLowerCase().includes('never')));
});
