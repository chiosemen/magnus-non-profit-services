export type PlaidClient = {
  getTransactionsSummary(params: {
    accessToken: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
  }): Promise<{ totalInflowUsd: number; totalOutflowUsd: number }>;
  getCashBalance(params: { accessToken: string }): Promise<{ cashBalanceUsd: number }>;
};

export type PlaidClientErrorCode = 'PLAID_MISCONFIGURED' | 'PLAID_NON_200';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function createPlaidClientFromEnv(): PlaidClient {
  const baseUrl = process.env['PLAID_BASE_URL'] ?? 'https://sandbox.plaid.com';
  const clientId = process.env['PLAID_CLIENT_ID'] ?? '';
  const secret = process.env['PLAID_SECRET'] ?? '';

  async function postJson(path: string, body: unknown): Promise<any> {
    if (!clientId.trim() || !secret.trim()) throw new Error('PLAID_MISCONFIGURED');
    const resp = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error('PLAID_NON_200');
    return await resp.json();
  }

  return {
    async getTransactionsSummary(params) {
      const json = await postJson('/transactions/get', {
        access_token: params.accessToken,
        start_date: params.startDate,
        end_date: params.endDate,
      });
      const txs: any[] = Array.isArray(json?.transactions) ? json.transactions : [];

      // Plaid `amount` is positive for outflow (debits) in many integrations; be defensive.
      let outflow = 0;
      let inflow = 0;
      for (const t of txs) {
        const amt = typeof t?.amount === 'number' && Number.isFinite(t.amount) ? t.amount : 0;
        // If an explicit direction exists, respect it; else use sign convention guess.
        const dir = typeof t?.transaction_type === 'string' ? t.transaction_type : null;
        if (dir === 'credit') inflow += Math.abs(amt);
        else if (dir === 'debit') outflow += Math.abs(amt);
        else {
          if (amt >= 0) outflow += amt;
          else inflow += Math.abs(amt);
        }
      }
      return { totalInflowUsd: inflow, totalOutflowUsd: outflow };
    },

    async getCashBalance(params) {
      const json = await postJson('/accounts/balance/get', { access_token: params.accessToken });
      const accts: any[] = Array.isArray(json?.accounts) ? json.accounts : [];
      let cash = 0;
      for (const a of accts) {
        const cur = a?.balances?.current;
        if (typeof cur === 'number' && Number.isFinite(cur)) cash += cur;
      }
      return { cashBalanceUsd: cash };
    },
  };
}

export function lastNMonthsRange(months: number, end: Date): { startDate: string; endDate: string } {
  const endD = new Date(end);
  const startD = new Date(end);
  startD.setMonth(startD.getMonth() - months);
  return { startDate: isoDate(startD), endDate: isoDate(endD) };
}

