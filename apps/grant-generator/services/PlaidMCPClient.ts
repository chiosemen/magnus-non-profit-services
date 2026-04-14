/**
 * Magnus Grant Generator — PlaidMCPClient
 * Connects securely to the Magnus MCP Connector for financial abstraction
 */

import { getEnv } from '@magnus/config';

export interface PlaidFinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netAssets: number;
  cashBalance: number;
  monthsOfReserves: number;
  revenueStreams: Array<{ name: string; amount: number; isRecurring: boolean }>;
  expenseCategories: Array<{ name: string; amount: number; isProgramRelated: boolean }>;
  period: { start: string; end: string };
}

export class PlaidMCPClient {
  private readonly mcpUrl: string;

  constructor() {
    this.mcpUrl = getEnv('grant-generator').MCP_CONNECTOR_URL ?? 'http://localhost:3001';
  }

  // NOTE: the MCP get-revenue-breakdown returns a different schema (diverged structure),
  // but to avoid regressions down the line we adapt it back to PlaidFinancialSummary.
  async getFinancialSummary(
    ein: string,
    plaidAccessToken: string,
    months = 12
  ): Promise<PlaidFinancialSummary | null> {
    try {
      const response = await fetch(`${this.mcpUrl}/tools/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getSystemToken()}`,
        },
        body: JSON.stringify({
          toolName: 'get-revenue-breakdown',
          params: { ein, tax_year: new Date().getFullYear(), plaid_access_token: plaidAccessToken },
        }),
      });

      if (!response.ok) return null;

      const data = await response.json() as Record<string, unknown>;

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      // Extract numeric values with safe defaults
      const totalRevenue = (typeof data.total_revenue_raw === 'number' ? data.total_revenue_raw : 0);
      const totalExpenses = (typeof data.total_expenses_raw === 'number' ? data.total_expenses_raw : 0);
      const netAssets = (typeof data.net_assets_raw === 'number' ? data.net_assets_raw : 0);
      const cashBalance = (typeof data.cash_balance_raw === 'number' ? data.cash_balance_raw : 0);
      const revenueStreams = Array.isArray(data.revenue_streams) ? data.revenue_streams : [];

      // Map get-revenue-breakdown output back to PlaidFinancialSummary
      return {
        totalRevenue,
        totalExpenses,
        netAssets,
        cashBalance,
        monthsOfReserves: netAssets && totalExpenses
          ? (netAssets / (totalExpenses / 12))
          : 0,
        revenueStreams: revenueStreams.map((s: Record<string, unknown>) => ({
          name: String(s.category ?? ''),
          amount: typeof s.amount_raw === 'number' ? s.amount_raw : 0,
          isRecurring: Boolean(s.is_recurring),
        })),
        expenseCategories: [],
        period: {
          start: startDate.toISOString().split('T')[0]!,
          end: new Date().toISOString().split('T')[0]!,
        },
      };
    } catch {
      return null;
    }
  }

  async getAccountBalances(ein: string, plaidAccessToken: string): Promise<number | null> {
    try {
      const summary = await this.getFinancialSummary(ein, plaidAccessToken, 1);
      return summary ? summary.cashBalance : null;
    } catch {
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.mcpUrl}/health`, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Mocks an internal system worker token representing the grant-generator 
  // (In full implementation, this uses a machine-to-machine JWT from auth server)
  private getSystemToken(): string {
    const jwt = require('jsonwebtoken'); // Lazy require
    const env = getEnv('grant-generator');
    return jwt.sign(
      {
        sub: 'system_grant_generator',
        orgId: '*',
        email: 'system@magnus.app',
        roles: ['system'],
        permissions: ['*'],
        sessionId: 'sys-session',
      },
      env.JWT_SECRET,
      { issuer: env.JWT_ISSUER || 'magnus-mcp-connector', audience: env.JWT_AUDIENCE || 'magnus-nonprofit-os', expiresIn: '5m' }
    );
  }
}

export default PlaidMCPClient;
