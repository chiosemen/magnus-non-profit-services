import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCORD_ACTION_CLASSES,
  ACCORD_CONNECTOR_ACTION_MATRIX,
  getConnectorActionPolicy,
  IRREVERSIBLE_ACTION_CLASS,
} from '../accordActionMatrix';
import { ACCORD_CONNECTOR_REGISTRY, listAllRegistryKeys } from '../connectorRegistry';

test('every registry connector has a full action matrix row', () => {
  for (const key of listAllRegistryKeys()) {
    assert.ok(ACCORD_CONNECTOR_REGISTRY[key]);
    const row = ACCORD_CONNECTOR_ACTION_MATRIX[key];
    assert.ok(row, key);
    for (const ac of ACCORD_ACTION_CLASSES) {
      assert.ok(row[ac], `${key}.${ac}`);
    }
  }
});

test('irreversible_action is NEVER for autonomous agents on every connector', () => {
  for (const key of listAllRegistryKeys()) {
    assert.equal(
      getConnectorActionPolicy({ connectorKey: key, actionClass: IRREVERSIBLE_ACTION_CLASS }),
      'NEVER',
      key
    );
  }
});

test('external_send and external_submit are NEVER for autonomous agents on all connectors', () => {
  for (const key of listAllRegistryKeys()) {
    assert.equal(getConnectorActionPolicy({ connectorKey: key, actionClass: 'external_send' }), 'NEVER', key);
    assert.equal(getConnectorActionPolicy({ connectorKey: key, actionClass: 'external_submit' }), 'NEVER', key);
  }
});
