import test from 'node:test';
import assert from 'node:assert/strict';
import { isFeatureEnabled } from '../policy';

test('STARTER allows donor CRM, basic campaigns, and compliance calendar only', () => {
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'ACTIVE', featureKey: 'donor_crm' }), true);
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'ACTIVE', featureKey: 'campaigns' }), true);
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'ACTIVE', featureKey: 'compliance_calendar' }), true);
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'ACTIVE', featureKey: 'stripe_connect_campaigns' }), false);
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'ACTIVE', featureKey: 'fund_accounting_lite' }), false);
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'ACTIVE', featureKey: 'grant_generator' }), false);
});

test('GROWTH allows operational S4NP modules and assisted autonomous ops', () => {
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'stripe_connect_campaigns' }), true);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'fund_accounting_lite' }), true);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'ai_concierge' }), true);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'board_packets' }), true);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'compliance_reminders' }), true);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'grant_generator' }), true);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'claude_partner' }), false);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'mcp_tools' }), false);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'worker_financial_layer' }), false);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'autonomous_ops_assisted' }), true);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'autonomous_ops_standard' }), false);
});

test('ENTERPRISE allows full public OS and autonomous ops flags but not internal-only tools', () => {
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'agents_layer' }), true);
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'stripe_connect_campaigns' }), true);
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'ai_concierge' }), true);
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'worker_financial_layer' }), false);
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'mcp_tools' }), false);
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'autonomous_ops_assisted' }), true);
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'autonomous_ops_standard' }), true);
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'autonomous_ops_institutional' }), true);
});

test('non-ACTIVE subscription status disables all features', () => {
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'PAST_DUE', featureKey: 'agents_layer' }), false);
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'CANCELED', featureKey: 'donor_crm' }), false);
});
