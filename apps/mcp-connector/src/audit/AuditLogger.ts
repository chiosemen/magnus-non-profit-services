/**
 * Magnus MCP Connector — AuditLogger
 * Replaces in-memory storage with persistent logging via Prisma AgentOperationalMemoryEntry.
 */

import { prisma } from '@magnus/db/client';

export type ToolCallMetadata = {
  toolName: string;
  userId: string;
  orgId: string;
  requestId: string;
  route: string;
  method: string;
  hasParameters: boolean;
  parameterCount: number;
};

export interface ToolCallLog {
  toolName: string;
  userId: string;
  orgId: string;
  metadata: ToolCallMetadata;
  timestamp: Date;
  requestId: string;
}

export interface ToolResultLog {
  toolName: string;
  userId: string;
  orgId: string;
  success: boolean;
  statusCode: number;
  durationMs: number;
  timestamp: Date;
  requestId: string;
  resultSummary?: string;
}

export class AuditLogger {
  async logToolCall(call: ToolCallLog): Promise<void> {
    try {
      await prisma.agentOperationalMemoryEntry.create({
        data: {
          orgId: call.orgId,
          agentName: `mcp_connector:${call.userId}`,
          kind: 'tool_call',
          payload: {
            toolName: call.toolName,
            metadata: call.metadata,
            timestamp: call.timestamp.toISOString(),
            requestId: call.requestId,
          },
        },
      });
    } catch (error) {
      console.error('[AuditLogger] Failed to log tool call:', error);
    }
  }

  async logToolResult(result: ToolResultLog): Promise<void> {
    try {
      await prisma.agentOperationalMemoryEntry.create({
        data: {
          orgId: result.orgId,
          agentName: `mcp_connector:${result.userId}`,
          kind: 'tool_result',
          payload: {
            toolName: result.toolName,
            success: result.success,
            statusCode: result.statusCode,
            durationMs: result.durationMs,
            timestamp: result.timestamp.toISOString(),
            requestId: result.requestId,
            resultSummary: result.resultSummary,
          },
        },
      });
    } catch (error) {
      console.error('[AuditLogger] Failed to log tool result:', error);
    }
  }
}

export default AuditLogger;
