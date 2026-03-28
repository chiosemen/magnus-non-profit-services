/**
 * Magnus MCP Connector — AuditMiddleware
 * Express middleware: auto-logs every tool call through AuditLogger
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger, getLogger } from '@magnus/logging';
import { AuditLogger } from './AuditLogger';

const auditLogger = new AuditLogger();
const appLogger = createLogger({ service: 'mcp-connector', component: 'audit-middleware' });

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = req.requestId ?? (req.headers['x-request-id'] as string) ?? `req_${Date.now()}`;
  const toolName =
    req.params?.['toolName']
    ?? req.body?.method
    ?? req.path.split('/').pop()
    ?? 'unknown';
  const auth = (req as Request & { auth?: { sub?: string; orgId?: string } }).auth;
  const userId = auth?.sub ?? (req as Request & { userId?: string }).userId ?? 'anonymous';
  const orgId = auth?.orgId ?? (req as Request & { orgId?: string }).orgId ?? 'unknown';
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];

  // Log the inbound tool call
  auditLogger.logToolCall({
    toolName,
    userId,
    orgId,
    params: req.body?.params ?? {},
    timestamp: new Date(),
    requestId,
    ...(ipAddress !== undefined ? { ipAddress } : {}),
    ...(userAgent !== undefined ? { userAgent } : {}),
  }).catch(err => {
    getLogger(appLogger).error({ err, event: 'audit_tool_call_log_failed', toolName }, 'Failed to record tool call audit log');
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    auditLogger.logToolResult({
      toolName,
      userId,
      orgId,
      success: res.statusCode < 400,
      statusCode: res.statusCode,
      durationMs: duration,
      timestamp: new Date(),
      requestId,
      resultSummary: res.statusCode < 400 ? 'Success' : res.statusMessage ?? 'Error',
    }).catch(err => {
      getLogger(appLogger).error({ err, event: 'audit_tool_result_log_failed', toolName }, 'Failed to record tool result audit log');
    });
  });

  next();
}

export default auditMiddleware;
