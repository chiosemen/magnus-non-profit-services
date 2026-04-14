/**
 * Magnus Grant Generator — CandidMCPClient
 * Connects securely to the Magnus MCP Connector for funder research and grant opportunity data
 */

import { getEnv } from '@magnus/config';

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
  private readonly mcpUrl: string;

  constructor() {
    this.mcpUrl = getEnv('grant-generator').MCP_CONNECTOR_URL ?? 'http://localhost:3001';
  }

  async getFunderData(ein: string): Promise<CandidFunderData | null> {
    try {
      const response = await fetch(`${this.mcpUrl}/tools/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getSystemToken()}`,
        },
        body: JSON.stringify({
          toolName: 'get-funder-research',
          params: { funder_ein: ein, include_recent_grants: false },
        }),
      });

      if (!response.ok) return null;

      const data = await response.json() as Record<string, unknown>;
      const grantmaking = data.grantmaking as Record<string, unknown> | undefined;
      return {
        ein: (data.funder_ein as string) ?? ein,
        name: (data.funder_name as string) ?? 'Unknown Funder',
        focusAreas: (data.focus_areas as string[]) ?? [],
        averageGrant: (grantmaking?.average_grant_raw as number) ?? 0,
        totalGiving: (grantmaking?.total_giving_raw as number) ?? 0,
        acceptsUnsolicited: (data.accepts_unsolicited_proposals as boolean) ?? false,
        deadline: undefined,
        loiRequired: false,
      };
    } catch {
      return null;
    }
  }

  async searchOpportunities(_params: {
    nteeCode: string;
    state: string;
    budget: number;
  }): Promise<CandidGrantOpportunity[]> {
    // Note: get-funder-research does not strictly search opportunities by budget/context in the MCP baseline,
    // so we return empty/mock or wait for the full opportunity search tool to emerge.
    // For now, fail safely (graceful degrade).
    return [];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.mcpUrl}/health`, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

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

export default CandidMCPClient;
