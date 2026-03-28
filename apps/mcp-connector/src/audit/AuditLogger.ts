/**
 * Minimal AuditLogger used by AuditMiddleware.
 * Persists entries via AuditQueryService + append-only JSONL log.
 */

import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { createLogger, getLogger } from '@magnus/logging';
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
  private readonly logFilePath: string;
  private logDirEnsured = false;
  private readonly logger = createLogger({ service: 'mcp-connector', component: 'audit-logger' });

  constructor(store?: AuditQueryService, logFilePath?: string) {
    this.store = store ?? new AuditQueryService();
    this.logFilePath = logFilePath ?? resolve(process.cwd(), 'logs', 'mcp-audit.log');
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
    await this.record(entry);
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
    await this.record(entry);
  }

  private async record(entry: AuditEntry): Promise<void> {
    this.store.ingest(entry);
    try {
      await this.persist(entry);
    } catch (err) {
      getLogger(this.logger).error(
        { err, event: 'audit_log_persist_failed', toolName: entry.toolName },
        'Failed to persist audit log entry'
      );
    }
  }

  private async persist(entry: AuditEntry): Promise<void> {
    await this.ensureLogDir();
    const serialized = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    });
    await fs.appendFile(this.logFilePath, `${serialized}\n`, 'utf8');
  }

  private async ensureLogDir(): Promise<void> {
    if (this.logDirEnsured) return;
    await fs.mkdir(dirname(this.logFilePath), { recursive: true });
    this.logDirEnsured = true;
  }
}

export default AuditLogger;
