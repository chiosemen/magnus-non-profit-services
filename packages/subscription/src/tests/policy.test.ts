import test from 'node:test';
import assert from 'node:assert/strict';
import { isFeatureEnabled } from '../policy';

test('STARTER allows compliance_calendar only', () => {
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'ACTIVE', featureKey: 'compliance_calendar' }), true);
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'ACTIVE', featureKey: 'grant_generator' }), false);
});

test('GROWTH allows compliance_calendar + grant_generator + donor/volunteer ops', () => {
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'grant_generator' }), true);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'donor_operations' }), true);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'volunteer_operations' }), true);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'claude_partner' }), false);
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'executive_rollups' }), false);
});

test('ENTERPRISE allows full OS', () => {
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'agents_layer' }), true);
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'worker_financial_layer' }), true);
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'institutional_partner' }), true);
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'ACTIVE', featureKey: 'executive_rollups' }), true);
});

test('GROWTH and STARTER deny institutional_partner', () => {
  assert.equal(isFeatureEnabled({ tier: 'GROWTH', status: 'ACTIVE', featureKey: 'institutional_partner' }), false);
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'ACTIVE', featureKey: 'institutional_partner' }), false);
});

test('non-ACTIVE subscription status disables all features', () => {
  assert.equal(isFeatureEnabled({ tier: 'ENTERPRISE', status: 'PAST_DUE', featureKey: 'agents_layer' }), false);
  assert.equal(isFeatureEnabled({ tier: 'STARTER', status: 'CANCELED', featureKey: 'compliance_calendar' }), false);
});

