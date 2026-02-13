import test from 'node:test';
import assert from 'node:assert/strict';
import { OrgClaudeConfigService } from '../services/OrgClaudeConfigService';

test('ensurePartnerAccess fails for starter orgs', async () => {
  const db: any = {
    organization: {
      findUnique: async () => ({ subscriptionTier: 'STARTER', claudeStatus: 'NOT_ENABLED' }),
    },
    orgClaudeConfig: {
      findUnique: async () => ({ enabled: true }),
    },
  };
  const svc = new OrgClaudeConfigService(db);
  await assert.rejects(() => svc.ensurePartnerAccess('org1'), /PARTNER_TIER_REQUIRED/);
});
