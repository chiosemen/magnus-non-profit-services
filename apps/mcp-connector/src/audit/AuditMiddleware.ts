/**
 * Magnus MCP Connector — AuditMiddleware
 * Express middleware: auto-logs every tool call through AuditLogger
 */

import { Request, Response, NextFunction } from 'express';
import { AuditLogger } from './AuditLogger';

const logger = new AuditLogger();

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const toolName = req.body?.toolName ?? req.body?.method ?? req.path.split('/').pop() ?? 'unknown';
  const userId = (req as Request & { userId?: string }).userId ?? 'anonymous';
  const orgId = (req as Request & { orgId?: string }).orgId ?? 'unknown';
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];

  // Log the inbound tool call
  logger.logToolCall({
    toolName,
    userId,
    orgId,
    params: req.body?.params ?? {},
    timestamp: new Date(),
    requestId: req.headers['x-request-id'] as string ?? `req_${Date.now()}`,
    ...(ipAddress !== undefined ? { ipAddress } : {}),
    ...(userAgent !== undefined ? { userAgent } : {}),
  }).catch(console.error);

  // Intercept response to log result
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let logged = false;

  res.json = function (body: unknown) {
    if (!logged) {
      logged = true;
      const duration = Date.now() - startTime;
      logger.logToolResult({
        toolName,
        userId,
        orgId,
        success: res.statusCode < 400,
        statusCode: res.statusCode,
        durationMs: duration,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string ?? `req_${Date.now()}`,
        resultSummary: res.statusCode < 400 ? 'Success' : String((body as Record<string, unknown>)?.error ?? 'Error'),
      }).catch(console.error);
    }
    return originalJson(body);
  };

  res.send = function (body: unknown) {
    if (!logged) {
      logged = true;
      const duration = Date.now() - startTime;
      logger.logToolResult({
        toolName,
        userId,
        orgId,
        success: res.statusCode < 400,
        statusCode: res.statusCode,
        durationMs: duration,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string ?? `req_${Date.now()}`,
        resultSummary: res.statusCode < 400 ? 'Success' : 'Error',
      }).catch(console.error);
    }
    return originalSend(body);
  };

  next();
}

export default auditMiddleware;
