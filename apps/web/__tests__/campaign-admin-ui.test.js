const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientPath = path.join(
  __dirname,
  '..',
  'src',
  'app',
  '(protected)',
  'app',
  'donors',
  'campaigns',
  'CampaignsClient.tsx'
);

function source() {
  return fs.readFileSync(clientPath, 'utf8');
}

test('campaign UI defines truthful loading, empty, and error states', () => {
  const src = source();
  assert.match(src, /Loading campaigns…/);
  assert.match(src, /No campaigns yet\. Create your first draft campaign below\./);
  assert.match(src, /setError\(/);
});

test('campaign UI contains publish-blocked copy tied to Stripe Connect status', () => {
  const src = source();
  assert.match(src, /Publishing is blocked until Stripe Connect status is ENABLED\./);
  assert.match(src, /\/api\/org\/stripe-connect\/status/);
});

test('campaign UI includes list, create, edit, publish, and archive actions', () => {
  const src = source();
  assert.match(src, /Campaign list/);
  assert.match(src, /Create campaign/);
  assert.match(src, /Selected campaign/);
  assert.match(src, /Create draft/);
  assert.match(src, /Save edits/);
  assert.match(src, /Publish/);
  assert.match(src, /Archive/);
});
