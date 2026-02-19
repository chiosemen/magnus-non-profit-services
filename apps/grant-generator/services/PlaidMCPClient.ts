/**
 * Magnus Grant Generator — PlaidMCPClient
 * Connects to Plaid's MCP server for live financial data in grant proposals
 */

import Anthropic from '@anthropic-ai/sdk';

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
  private readonly client: Anthropic;
  private readonly mcpUrl: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
    this.mcpUrl = process.env['PLAID_MCP_URL'] ?? 'https://mcp.plaid.com/sse';
  }

  async getFinancialSummary(
    accessToken: string,
    months = 12
  ): Promise<PlaidFinancialSummary | null> {
    try {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const response: any = await (this.client as any).beta.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 2048,
        mcp_servers: [{ type: 'url', url: this.mcpUrl, name: 'plaid' }],
        messages: [{
          role: 'user',
          content: `Use the Plaid MCP tool with access token "${accessToken}" to fetch:
1. Transaction totals for the past ${months} months (from ${startDate.toISOString().split('T')[0]})
2. Account balances
3. Categorize transactions by revenue vs expense
Return as structured JSON with: totalRevenue, totalExpenses, netAssets, cashBalance, revenueStreams, expenseCategories.`,
        }],
      });

      const text = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => (b as { type: 'text'; text: string }).text)
        .join('');

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const data = JSON.parse(match[0]) as Partial<PlaidFinancialSummary>;
      return {
        totalRevenue: data.totalRevenue ?? 0,
        totalExpenses: data.totalExpenses ?? 0,
        netAssets: data.netAssets ?? 0,
        cashBalance: data.cashBalance ?? 0,
        monthsOfReserves: data.netAssets && data.totalExpenses
          ? (data.netAssets / (data.totalExpenses / 12))
          : 0,
        revenueStreams: data.revenueStreams ?? [],
        expenseCategories: data.expenseCategories ?? [],
        period: {
          start: startDate.toISOString().split('T')[0]!,
          end: new Date().toISOString().split('T')[0]!,
        },
      };
    } catch {
      return null;
    }
  }

  async getAccountBalances(accessToken: string): Promise<number | null> {
    try {
      const response: any = await (this.client as any).beta.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 512,
        mcp_servers: [{ type: 'url', url: this.mcpUrl, name: 'plaid' }],
        messages: [{
          role: 'user',
          content: `Using Plaid with access token "${accessToken}", fetch the total balance across all accounts. Return just the number.`,
        }],
      });

      const text = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => (b as { type: 'text'; text: string }).text)
        .join('');

      const match = text.match(/[\d,]+\.?\d*/);
      return match ? parseFloat(match[0].replace(',', '')) : null;
    } catch {
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.mcpUrl, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default PlaidMCPClient;
