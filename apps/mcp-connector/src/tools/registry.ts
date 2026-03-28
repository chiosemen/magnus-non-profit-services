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
import getFunderResearch from './grants/get-funder-research';
import getGrantHistory from './grants/get-grant-history';
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

// Feature flag helpers
const isEnabled = (flag?: string): boolean => {
  if (!flag) return true;
  return (process.env[flag] ?? '').toLowerCase() === 'true';
};

interface ToolDefinition {
  tool: MCPTool;
  flagEnv?: string;
}

// Register all tools with optional flags
const toolDefinitions: ToolDefinition[] = [
  { tool: { ...getFilingHistory, category: 'compliance', description: 'Get 990 filing history for a nonprofit' } },
  { tool: { ...getStateRegistrations, category: 'compliance', description: 'Get state charity registrations' } },
  { tool: { ...getExpenseAllocation, category: 'financials', description: 'Get expense allocation breakdown' } },
  { tool: { ...getRevenueBreakdown, category: 'financials', description: 'Get revenue breakdown by source' } },
  { tool: { ...getFunderResearch, category: 'grants', description: 'Research potential funders' } },
  { tool: { ...getGrantHistory, category: 'grants', description: 'Get grant history for an org' } },
  {
    tool: { ...getIncomeSummary, category: 'workers', description: 'Get income summary with volatility analysis' },
    flagEnv: 'MCP_ENABLE_WORKER_TOOLS',
  },
  {
    tool: { ...getMultiOrgProfile, category: 'workers', description: 'Get worker profile across multiple orgs' },
    flagEnv: 'MCP_ENABLE_WORKER_TOOLS',
  },
  {
    tool: { ...getTaxEstimates, category: 'workers', description: 'Get quarterly tax estimates' },
    flagEnv: 'MCP_ENABLE_WORKER_TOOLS',
  },
];

for (const entry of toolDefinitions) {
  if (!isEnabled(entry.flagEnv)) continue;
  TOOL_REGISTRY.set(entry.tool.name, entry.tool);
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
