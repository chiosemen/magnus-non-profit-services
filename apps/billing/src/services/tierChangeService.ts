import type { FeatureKey } from '@magnus/subscription';
import type { DbClient } from '../db';
import { isFeatureEnabled } from '@magnus/subscription';

// Internal helper: compare tiers.
const TIER_RANK: Record<string, number> = { STARTER: 0, GROWTH: 1, ENTERPRISE: 2 };

type BillingTx = Pick<DbClient, 'organization' | 'orgClaudeConfig'>;

export class TierChangeService {
  async handleChange(params: {
    tx: BillingTx;
    orgId: string;
    prevTier: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
    newTier: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
    prevStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
    newStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  }): Promise<void> {
    const downgraded = TIER_RANK[params.newTier] < TIER_RANK[params.prevTier];
    const becameNonActive = params.prevStatus === 'ACTIVE' && params.newStatus !== 'ACTIVE';

    if (downgraded || becameNonActive || params.newStatus !== 'ACTIVE') {
      await this.enforceRevocation(params.tx, params.orgId, params.newTier, params.newStatus);
    }
  }

  private async enforceRevocation(
    tx: BillingTx,
    orgId: string,
    tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE',
    status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED',
  ): Promise<void> {
    // Immediately enforce feature revocation on downgrade/non-active status.
    await this.maybeSuspendClaude(tx, orgId, tier, status);
    // Agents suspension is enforced at runtime in apps/agents via subscription policy.
  }

  private async maybeSuspendClaude(
    tx: BillingTx,
    orgId: string,
    tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE',
    status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED',
  ): Promise<void> {
    const allowed = isFeatureEnabled({ tier: tier as any, status: status as any, featureKey: 'claude_partner' as FeatureKey });
    if (!allowed) {
      await tx.organization.update({
        where: { id: orgId },
        data: { claudeStatus: 'SUSPENDED' },
        select: { id: true },
      });
      await tx.orgClaudeConfig.updateMany({
        where: { orgId },
        data: { enabled: false },
      });
    }
  }
}
