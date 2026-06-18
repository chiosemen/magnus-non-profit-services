const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const publicCampaignPage = path.join(
  __dirname,
  '..',
  'src',
  'app',
  '(marketing)',
  'campaigns',
  '[slug]',
  'page.tsx',
);

const adminCampaignPage = path.join(
  __dirname,
  '..',
  'src',
  'app',
  '(protected)',
  'app',
  'campaigns',
  'page.tsx',
);

const stripeConnectPage = path.join(
  __dirname,
  '..',
  'src',
  'app',
  '(protected)',
  'app',
  'donors',
  'stripe-connect',
  'StripeConnectClient.tsx',
);

test('public campaign page presents explicit payment-gated pilot copy', () => {
  const src = read(publicCampaignPage);
  assert.match(src, /paymentsEnabled/);
  assert.match(src, /Payments are not enabled in this private pilot\./);
  assert.match(src, /Use your existing donation processor while Magnus Accord tracks campaign readiness\./);
  assert.match(src, /Stripe Connect verification pending\./);
  assert.match(src, /Payments Disabled For Pilot/);
});

test('authenticated campaign admin no longer implies native checkout is live during gated pilot mode', () => {
  const src = read(adminCampaignPage);
  assert.match(src, /PAYMENT-GATED/);
  assert.match(src, /native Magnus Accord checkout remains disabled for this private pilot/);
});

test('Stripe Connect dashboard surfaces the pilot payment gate clearly', () => {
  const src = read(stripeConnectPage);
  assert.match(src, /paymentsEnabled/);
  assert.match(src, /Payments are not enabled in this private pilot\./);
  assert.match(src, /Stripe Connect verification pending\./);
});
