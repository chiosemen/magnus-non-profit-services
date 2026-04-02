import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaidClientFromEnv } from '../agents/financialSentinel/plaidClient';

test('Plaid client fails closed when env is misconfigured', async () => {
  const oldClientId = process.env['PLAID_CLIENT_ID'];
  const oldSecret = process.env['PLAID_SECRET'];
  const oldBaseUrl = process.env['PLAID_BASE_URL'];
  try {
    process.env['PLAID_CLIENT_ID'] = '';
    process.env['PLAID_SECRET'] = '';
    process.env['PLAID_BASE_URL'] = 'https://example.invalid';

    const plaid = createPlaidClientFromEnv();
    await assert.rejects(() => plaid.getCashBalance({ accessToken: 'tok' }), /PLAID_MISCONFIGURED/);
  } finally {
    process.env['PLAID_CLIENT_ID'] = oldClientId;
    process.env['PLAID_SECRET'] = oldSecret;
    process.env['PLAID_BASE_URL'] = oldBaseUrl;
  }
});

