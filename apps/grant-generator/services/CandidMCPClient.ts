/**
 * Magnus Grant Generator — CandidMCPClient
 * Connects to Candid's MCP server for funder research and grant opportunity data
 */

import Anthropic from '@anthropic-ai/sdk';

export interface CandidFunderData {
  ein: string;
  name: string;
  focusAreas: string[];
  averageGrant: number;
  totalGiving: number;
  acceptsUnsolicited: boolean;
  deadline?: string;
  loiRequired: boolean;
}

export interface CandidGrantOpportunity {
  id: string;
  funderName: string;
  funderEIN: string;
  programName: string;
  minGrant: number;
  maxGrant: number;
  deadline?: string;
  nteeEligible: string[];
  statesEligible: string[];
  description: string;
}

export class CandidMCPClient {
  private readonly client: Anthropic;
  private readonly mcpUrl: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
    this.mcpUrl = process.env['CANDID_MCP_URL'] ?? 'https://mcp.candid.org/sse';
  }

  async getFunderData(ein: string): Promise<CandidFunderData | null> {
    try {
      const response = await this.client.beta.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 1024,
        mcp_servers: [{ type: 'url', url: this.mcpUrl, name: 'candid' }],
        messages: [{
          role: 'user',
          content: `Use the Candid MCP tool to fetch funder data for EIN ${ein}. Return the result as JSON.`,
        }],
      } as Parameters<typeof this.client.beta.messages.create>[0]);

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('');

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      return JSON.parse(match[0]) as CandidFunderData;
    } catch {
      return null;
    }
  }

  async searchOpportunities(params: {
    nteeCode: string;
    state: string;
    budget: number;
  }): Promise<CandidGrantOpportunity[]> {
    try {
      const response = await this.client.beta.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 2048,
        mcp_servers: [{ type: 'url', url: this.mcpUrl, name: 'candid' }],
        messages: [{
          role: 'user',
          content: `Search Candid for grant opportunities matching:
- NTEE Code: ${params.nteeCode}
- State: ${params.state}
- Annual Budget: $${params.budget.toLocaleString()}
Return top 10 results as JSON array.`,
        }],
      } as Parameters<typeof this.client.beta.messages.create>[0]);

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('');

      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return [];
      return JSON.parse(match[0]) as CandidGrantOpportunity[];
    } catch {
      return [];
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

export default CandidMCPClient;
