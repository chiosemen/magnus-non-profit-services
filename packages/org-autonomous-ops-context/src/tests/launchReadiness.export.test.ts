import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunchReadinessReport } from '../launchReadiness';

test('buildLaunchReadinessReport is exported and is async function', () => {
  assert.equal(typeof buildLaunchReadinessReport, 'function');
  assert.equal(buildLaunchReadinessReport.constructor.name, 'AsyncFunction');
});
