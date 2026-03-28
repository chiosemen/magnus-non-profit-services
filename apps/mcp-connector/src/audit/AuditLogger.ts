/**
 * Minimal AuditLogger used by AuditMiddleware.
 * Stores entries in-memory via AuditQueryService (dev-friendly).
 */

import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import AuditQueryService, { AuditEntry } from './AuditQueryService';

export interface ToolCallLog {
  toolName: string;
  userId: string;
  orgId: string;
  sessionId?: string | undefined;
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
  sessionId?: string | undefined;
  success: boolean;
  statusCode: number;
  durationMs: number;
  timestamp: Date;
  requestId: string;
  resultSummary?: string;
}

export class AuditLogger {
  private readonly store: AuditQueryService;
  private readonly durablePath: string;

  constructor(store?: AuditQueryService, durablePath?: string) {
    this.store = store ?? new AuditQueryService();
    this.durablePath = durablePath ?? process.env['MCP_AUDIT_LOG_PATH'] ?? join(process.cwd(), 'storage', 'mcp-audit-log.ndjson');
  }

  async logToolCall(call: ToolCallLog): Promise<void> {
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
    await this.persist({
      ...entry,
      event: 'call',
      ...(call.sessionId ? { sessionId: call.sessionId } : {}),
      ...(call.params !== undefined ? { params: call.params } : {}),
      ...(call.userAgent ? { userAgent: call.userAgent } : {}),
    });
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
    await this.persist({
      ...entry,
      event: 'result',
      ...(result.sessionId ? { sessionId: result.sessionId } : {}),
    });
  }

  private async persist(record: DurableAuditRecord): Promise<void> {
    await ensureDirectory(this.durablePath);
    const payload = {
      ...record,
      timestamp: record.timestamp.toISOString(),
    };
    await fs.appendFile(this.durablePath, `${JSON.stringify(payload)}\n`, 'utf8');
  }
}

interface DurableAuditRecord extends AuditEntry {
  event: 'call' | 'result';
  sessionId?: string;
  params?: unknown;
  userAgent?: string;
}

async function ensureDirectory(filePath: string): Promise<void> {
  try {
    await fs.mkdir(dirname(filePath), { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err;
    }
  }
}

export default AuditLogger;
