import test from 'node:test';
import assert from 'node:assert/strict';
import { SubscriptionSyncService } from '../services/subscriptionSyncService';

test('syncFromSubscription throws if tier metadata missing', async () => {
  const db: any = {
    organization: { findFirst: async () => ({ id: 'o1', subscriptionTier: 'ENTERPRISE', subscriptionStatus: 'ACTIVE' }) },
    $transaction: async (fn: any) => fn(db),
  };
  const stripe: any = {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub',
        customer: 'cus',
        status: 'active',
        items: { data: [{ price: { metadata: {} } }] },
      }),
    },
  };
  const svc = new SubscriptionSyncService({ db, stripe });
  await assert.rejects(
    () =>
      svc.syncFromSubscription({
        id: 'sub',
        customer: 'cus',
        status: 'active',
        items: { data: [{ price: { metadata: {} } }] },
      } as any),
    /STRIPE_TIER_METADATA_MISSING/,
  );
});
