import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageAuditService } from '../services/UsageAuditService';

test('enforceUsageCap suspends org and throws when cap exceeded', async () => {
  let suspended = false;
  const db: any = {
    organization: {
      findUnique: async () => ({ id: 'o1', subscriptionTier: 'GROWTH', claudeStatus: 'ACTIVE' }),
      update: async () => {
        suspended = true;
        return { id: 'o1' };
      },
    },
    orgClaudeConfig: {
      findUnique: async () => ({ enabled: true, monthlyTokenCap: 200000 }),
    },
    claudeUsageLog: {
      aggregate: async () => ({ _sum: { tokenCount: 200001, cost: '0' } }),
    },
  };
  const svc = new UsageAuditService(db);
  await assert.rejects(() => svc.enforceUsageCap('o1', new Date('2026-02-13T00:00:00Z')), /USAGE_CAP_EXCEEDED/);
  assert.equal(suspended, true);
});

