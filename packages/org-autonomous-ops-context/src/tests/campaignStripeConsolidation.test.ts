import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve(__dirname, '../../src');

test('package root exposes canonical campaign and Stripe Connect services only', () => {
  const indexSource = fs.readFileSync(path.join(sourceRoot, 'index.ts'), 'utf8');

  assert.match(indexSource, /from '\.\/campaignService'/);
  assert.match(indexSource, /from '\.\/stripeConnectService'/);
  assert.match(indexSource, /from '\.\/stripePaymentService'/);
  assert.doesNotMatch(indexSource, /stripeCampaignService/);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'stripeCampaignService.ts')), false);
});
