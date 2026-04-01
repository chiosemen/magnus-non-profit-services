import test from 'node:test';
import assert from 'node:assert/strict';
import { AutonomousOpsSettingsService } from '../autonomySettingsService';

test('AutonomousOpsSettingsService returns safe defaults when row missing', async () => {
  const calls: any[] = [];
  const fakeDb: any = {
    organization: {
      findUnique: async () => ({ id: 'org1' }),
    },
    orgAutonomousOpsSettings: {
      findUnique: async () => null,
      upsert: async (_args: any) => {
        calls.push(_args);
        return {
          orgId: 'org1',
          enabledAgents: ['A'],
          maxAutonomyTier: 'TIER_B_ASK_FIRST',
          agentBoundaryOverrides: { A: 'ask_first' },
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        };
      },
    },
  };

  const svc = new AutonomousOpsSettingsService(fakeDb);
  const d = await svc.get('org1');
  assert.deepEqual(d.enabledAgents, []);
  assert.deepEqual(d.agentBoundaryOverrides, {});
  assert.equal(d.maxAutonomyTier, 'TIER_A_AUTONOMOUS');

  const u = await svc.upsert('org1', {
    enabledAgents: ['ComplianceWatchdog'],
    maxAutonomyTier: 'TIER_B_ASK_FIRST',
    agentBoundaryOverrides: { ComplianceWatchdog: 'ask_first' },
  });
  assert.equal(u.enabledAgents[0], 'ComplianceWatchdog');
  assert.equal(u.maxAutonomyTier, 'TIER_B_ASK_FIRST');
  assert.equal(u.agentBoundaryOverrides['ComplianceWatchdog'], 'ask_first');
  assert.equal(calls.length, 1);
});

