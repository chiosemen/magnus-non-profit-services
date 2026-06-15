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

test('buildClientConnectorPanels renders only client-visible connector panels', () => {
  const rows = buildClientConnectorPanels({ claudePartnerStatus: 'ACTIVE' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'claudePartner');
  assert.equal(rows[0].runtimeStatus, 'ACTIVE');
  assert.equal(ACCORD_CONNECTOR_REGISTRY.mcpConnector.clientVisible, false);
  assert.equal(ACCORD_CONNECTOR_REGISTRY.grantGenerator.clientVisible, false);
  assert.equal(ACCORD_CONNECTOR_REGISTRY.workerFinancialLayer.clientVisible, false);
});

test('listAllRegistryKeys includes internal connectors', () => {
  const keys = listAllRegistryKeys();
  assert.ok(keys.includes('plaidFinancialWatch'));
  assert.ok(keys.includes('slackOutboundAlerts'));
  assert.equal(keys.length, Object.keys(ACCORD_CONNECTOR_REGISTRY).length);
});
