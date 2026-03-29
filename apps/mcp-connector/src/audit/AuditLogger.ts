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

export interface AuditSink {
  readonly kind: 'durable' | 'file';
  write(record: DurableAuditRecord): Promise<void>;
}

export class AuditLogger {
  readonly sinkKind: AuditSink['kind'];

  private readonly store: AuditQueryService;
  private readonly sink: AuditSink;

  constructor(store?: AuditQueryService, sink?: AuditSink) {
    this.store = store ?? new AuditQueryService();
    this.sink = sink ?? createDefaultSink();
    this.sinkKind = this.sink.kind;
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
    await this.sink.write({
      ...entry,
      event: 'call',
      status: 'started',
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
    await this.sink.write({
      ...entry,
      event: 'result',
      status: result.success ? 'success' : 'error',
      ...(result.sessionId ? { sessionId: result.sessionId } : {}),
    });
  }
}

export class FileAuditSink implements AuditSink {
  readonly kind = 'file' as const;

  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? process.env['MCP_AUDIT_LOG_PATH'] ?? join(process.cwd(), 'storage', 'mcp-audit-log.ndjson');
  }

  async write(record: DurableAuditRecord): Promise<void> {
    await ensureDirectory(this.filePath);
    const payload = {
      ...record,
      timestamp: record.timestamp.toISOString(),
    };
    await fs.appendFile(this.filePath, `${JSON.stringify(payload)}\n`, 'utf8');
  }
}

interface DurableAuditRecord extends AuditEntry {
  event: 'call' | 'result';
  status: 'started' | 'success' | 'error';
  sessionId?: string;
  params?: unknown;
  userAgent?: string;
}

let auditLogger: AuditLogger | null = null;

export function configureAuditLogger(logger: AuditLogger): void {
  auditLogger = logger;
}

export function getAuditLogger(): AuditLogger {
  auditLogger ??= new AuditLogger();
  return auditLogger;
}

function createDefaultSink(): AuditSink {
  if (isProduction()) {
    throw new Error(
      'Production MCP audit logging requires a durable audit sink. Local NDJSON file logging is disabled in production; inject a durable AuditSink before startup.',
    );
  }

  return new FileAuditSink();
}

function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
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
