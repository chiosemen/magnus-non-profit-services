/**
 * Minimal AuditLogger used by AuditMiddleware.
 * Stores entries in-memory via AuditQueryService (dev-friendly).
 */

import AuditQueryService, { AuditEntry } from './AuditQueryService';

export interface ToolCallLog {
  toolName: string;
  userId: string;
  orgId: string;
  params: unknown;
  timestamp: Date;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
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
  private readonly store: AuditQueryService;

  constructor(store?: AuditQueryService) {
    this.store = store ?? new AuditQueryService();
  }

  async logToolCall(call: ToolCallLog): Promise<void> {
    // Tool calls are recorded as a placeholder entry; result will be logged separately.
    const entry: AuditEntry = {
      id: call.requestId,
      toolName: call.toolName,
      userId: call.userId,
      orgId: call.orgId,
      timestamp: call.timestamp,
      success: true,
      durationMs: 0,
      statusCode: 0,
      requestId: call.requestId,
      ...(call.ipAddress !== undefined ? { ipAddress: call.ipAddress } : {}),
      resultSummary: 'Started',
    };
    this.store.ingest(entry);
  }

  async logToolResult(result: ToolResultLog): Promise<void> {
    const entry: AuditEntry = {
      id: result.requestId,
      toolName: result.toolName,
      userId: result.userId,
      orgId: result.orgId,
      timestamp: result.timestamp,
      success: result.success,
      durationMs: result.durationMs,
      statusCode: result.statusCode,
      requestId: result.requestId,
      ...(result.resultSummary !== undefined ? { resultSummary: result.resultSummary } : {}),
    };
    this.store.ingest(entry);
  }
}

export default AuditLogger;
