/**
 * Magnus MCP Connector — Tool Registry
 * Central registry of all available MCP tools
 */

import { z } from 'zod';

// Tool imports
import getFilingHistory from './compliance/get-filing-history';
import getStateRegistrations from './compliance/get-state-registrations';
import getExpenseAllocation from './financials/get-expense-allocation';
import getRevenueBreakdown from './financials/get-revenue-breakdown';
import getRestrictedFundTracking from './financials/get-restricted-fund-tracking';
import getFunderResearch from './grants/get-funder-research';
import getGrantHistory from './grants/get-grant-history';
import getLoiDraft from './grants/get-loi-draft';
import getGrantProspectMatches from './grants/get-grant-prospect-matches';
import getIncomeSummary from './workers/get-income-summary';
import getMultiOrgProfile from './workers/get-multi-org-profile';
import getTaxEstimates from './workers/get-tax-estimates';

// Tool interface
export interface MCPTool {
  name: string;
  schema: z.ZodSchema;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input: any) => Promise<string>;
  description?: string;
  category?: string;
}

// Registry map
const TOOL_REGISTRY: Map<string, MCPTool> = new Map();

const workerToolsEnabled = (process.env['MCP_ENABLE_WORKER_ANALYTICS'] ?? '').toLowerCase() === 'true';

const baseTools: MCPTool[] = [
  { ...getFilingHistory, category: 'compliance', description: 'Get 990 filing history for a nonprofit' },
  { ...getStateRegistrations, category: 'compliance', description: 'Get state charity registrations' },
  { ...getExpenseAllocation, category: 'financials', description: 'Get expense allocation breakdown' },
  { ...getRevenueBreakdown, category: 'financials', description: 'Get revenue breakdown by source' },
  { ...getRestrictedFundTracking, category: 'financials', description: 'Track restricted funds with deterministic balance and risk flags (truthful; not GAAP accounting)' },
  { ...getFunderResearch, category: 'grants', description: 'Research potential funders' },
  { ...getGrantHistory, category: 'grants', description: 'Get grant history for an org' },
  { ...getLoiDraft, category: 'grants', description: 'Generate a grounded letter of inquiry (LOI) draft from provided inputs' },
  { ...getGrantProspectMatches, category: 'grants', description: 'Match and rank plausible grant prospects with explainable scoring (truthful fallback)' },
];

const workerTools: MCPTool[] = workerToolsEnabled
  ? [
    { ...getIncomeSummary, category: 'workers', description: 'Get income summary with volatility analysis' },
    { ...getMultiOrgProfile, category: 'workers', description: 'Get worker profile across multiple orgs' },
    { ...getTaxEstimates, category: 'workers', description: 'Get quarterly tax estimates' },
  ]
  : [];

for (const tool of [...baseTools, ...workerTools]) {
  TOOL_REGISTRY.set(tool.name, tool);
}

// Public API
export function getTool(name: string): MCPTool | undefined {
  return TOOL_REGISTRY.get(name);
}

export function getAllTools(): MCPTool[] {
  return Array.from(TOOL_REGISTRY.values());
}

export function getToolNames(): string[] {
  return Array.from(TOOL_REGISTRY.keys());
}

export function hasTool(name: string): boolean {
  return TOOL_REGISTRY.has(name);
}

export function getToolsByCategory(category: string): MCPTool[] {
  return getAllTools().filter(t => t.category === category);
}

export default TOOL_REGISTRY;
