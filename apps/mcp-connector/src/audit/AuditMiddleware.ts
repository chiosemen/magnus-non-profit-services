/**
 * Magnus MCP Connector — AuditMiddleware
 * Express middleware: auto-logs every tool call through AuditLogger
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger, getLogger } from '@magnus/logging';
import { getAuditLogger } from './AuditLogger';
import { TokenPayload } from '../auth/TokenValidator';

const appLogger = createLogger({ service: 'mcp-connector', component: 'audit-middleware' });

type AuditRequest = Request & {
  auth?: TokenPayload;
  requestId?: string;
};

export function auditMiddleware(req: AuditRequest, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const logger = getAuditLogger();
  const auth = req.auth;
  const toolName = req.params?.toolName ?? req.body?.method ?? req.path.split('/').pop() ?? 'unknown';
  const userId = auth?.sub ?? 'anonymous';
  const orgId = auth?.orgId ?? 'unknown';
  const sessionId = auth?.sessionId;
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];
  const requestId = req.requestId ?? (req.headers['x-request-id'] as string) ?? `req_${Date.now()}`;

  logger.logToolCall({
    toolName,
    userId,
    orgId,
    sessionId,
    params: req.body?.input ?? {},
    timestamp: new Date(),
    requestId,
    ...(ipAddress !== undefined ? { ipAddress } : {}),
    ...(userAgent !== undefined ? { userAgent } : {}),
  }).catch(err => {
    getLogger(appLogger).error({ err, event: 'audit_tool_call_log_failed', toolName }, 'Failed to record tool call audit log');
  });

  let resultSummary: string | undefined;
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    if (typeof body === 'object' && body !== null) {
      const maybeError = (body as Record<string, unknown>)?.['error'];
      if (typeof maybeError === 'string') {
        resultSummary = maybeError;
      } else if ('result' in (body as Record<string, unknown>)) {
        resultSummary = 'Success';
      }
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.logToolResult({
      toolName,
      userId,
      orgId,
      sessionId,
      success: res.statusCode < 400,
      statusCode: res.statusCode,
      durationMs: duration,
      timestamp: new Date(),
      requestId,
      resultSummary: resultSummary ?? (res.statusCode < 400 ? 'Success' : res.statusMessage ?? 'Error'),
    }).catch(err => {
      getLogger(appLogger).error({ err, event: 'audit_tool_result_log_failed', toolName }, 'Failed to record tool result audit log');
    });
  });

  next();
}

export default auditMiddleware;
