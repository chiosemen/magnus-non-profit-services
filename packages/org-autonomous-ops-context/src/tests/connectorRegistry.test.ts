import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCORD_CONNECTOR_REGISTRY,
  CLIENT_CONNECTOR_PANEL_KEYS,
  buildClientConnectorPanels,
  listAllRegistryKeys,
} from '../connectorRegistry';

test('CLIENT_CONNECTOR_PANEL_KEYS are subset of registry and ordered', () => {
  for (const k of CLIENT_CONNECTOR_PANEL_KEYS) {
    assert.ok(ACCORD_CONNECTOR_REGISTRY[k]);
    assert.equal(ACCORD_CONNECTOR_REGISTRY[k].clientVisible, true);
  }
});

test('buildClientConnectorPanels merges Claude status and pilot static rows', () => {
  const rows = buildClientConnectorPanels({ claudePartnerStatus: 'ACTIVE' });
  assert.equal(rows.length, 4);
  assert.equal(rows[0].key, 'claudePartner');
  assert.equal(rows[0].runtimeStatus, 'ACTIVE');
  assert.equal(rows[1].runtimeStatus, 'PILOT_ONLY');
});

test('listAllRegistryKeys includes internal connectors', () => {
  const keys = listAllRegistryKeys();
  assert.ok(keys.includes('plaidFinancialWatch'));
  assert.ok(keys.includes('slackOutboundAlerts'));
  assert.equal(keys.length, Object.keys(ACCORD_CONNECTOR_REGISTRY).length);
});
