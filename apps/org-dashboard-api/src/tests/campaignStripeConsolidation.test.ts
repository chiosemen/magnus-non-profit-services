import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve(__dirname, '../../src');

test('campaign and Stripe routes use the canonical registered route modules', () => {
  const serverSource = fs.readFileSync(path.join(sourceRoot, 'server.ts'), 'utf8');

  assert.match(serverSource, /registerCampaignRoutes\(app, jwtAuth\)/);
  assert.match(serverSource, /registerStripeConnectRoutes\(app, jwtAuth/);
  assert.match(serverSource, /registerPublicDonationRoutes\(app\)/);
  assert.doesNotMatch(serverSource, /registerStripeCampaignRoutes/);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'stripeCampaignRoutes.ts')), false);
});
