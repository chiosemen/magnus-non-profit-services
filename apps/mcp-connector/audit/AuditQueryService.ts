/**
 * Magnus MCP Connector — AuditQueryService
 * Queryable audit reports: tool usage, user activity, anomaly detection
 */

import { formatDateShort } from '../utils/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditQueryFilters {
  userId?: string;
  orgId?: string;
  toolName?: string;
  startDate?: Date;
  endDate?: Date;
  successOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditEntry {
  id: string;
  toolName: string;
  userId: string;
  orgId: string;
  timestamp: Date;
  success: boolean;
  durationMs: number;
  statusCode: number;
  requestId: string;
  ipAddress?: string;
  resultSummary?: string;
}

export interface UsageReport {
  period: { start: Date; end: Date };
  totalCalls: number;
  uniqueUsers: number;
  uniqueOrgs: number;
  successRate: number;
  avgDurationMs: number;
  topTools: Array<{ toolName: string; calls: number; successRate: number; avgDurationMs: number }>;
  topUsers: Array<{ userId: string; calls: number }>;
  errorSummary: Array<{ toolName: string; errorCount: number; commonError: string }>;
  hourlyDistribution: Array<{ hour: number; calls: number }>;
}

export interface AnomalyReport {
  detected: boolean;
  anomalies: Array<{
    type: 'unusual_volume' | 'repeated_errors' | 'off_hours_access' | 'new_ip';
    severity: 'info' | 'warning' | 'critical';
    userId: string;
    detail: string;
    detectedAt: Date;
  }>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AuditQueryService {
  // In production: these query the immutable audit_log table via Prisma
  // Mock in-memory store for development

  private entries: AuditEntry[] = [];

  ingest(entry: AuditEntry): void {
    this.entries.push(entry);
    // Keep last 10k entries in memory
    if (this.entries.length > 10000) this.entries = this.entries.slice(-10000);
  }

  async query(filters: AuditQueryFilters = {}): Promise<AuditEntry[]> {
    let results = [...this.entries];

    if (filters.userId) results = results.filter(e => e.userId === filters.userId);
    if (filters.orgId) results = results.filter(e => e.orgId === filters.orgId);
    if (filters.toolName) results = results.filter(e => e.toolName === filters.toolName);
    if (filters.startDate) results = results.filter(e => e.timestamp >= filters.startDate!);
    if (filters.endDate) results = results.filter(e => e.timestamp <= filters.endDate!);
    if (filters.successOnly) results = results.filter(e => e.success);

    results = results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async generateUsageReport(startDate: Date, endDate: Date): Promise<UsageReport> {
    const entries = await this.query({ startDate, endDate, limit: 100000 });

    const toolMap = new Map<string, { calls: number; success: number; totalMs: number }>();
    const userMap = new Map<string, number>();
    const orgSet = new Set<string>();
    const hourly = new Array(24).fill(0) as number[];

    for (const e of entries) {
      const t = toolMap.get(e.toolName) ?? { calls: 0, success: 0, totalMs: 0 };
      t.calls++;
      if (e.success) t.success++;
      t.totalMs += e.durationMs;
      toolMap.set(e.toolName, t);

      userMap.set(e.userId, (userMap.get(e.userId) ?? 0) + 1);
      orgSet.add(e.orgId);
      hourly[e.timestamp.getHours()]!++;
    }

    const totalSuccess = entries.filter(e => e.success).length;
    const totalMs = entries.reduce((s, e) => s + e.durationMs, 0);

    return {
      period: { start: startDate, end: endDate },
      totalCalls: entries.length,
      uniqueUsers: userMap.size,
      uniqueOrgs: orgSet.size,
      successRate: entries.length > 0 ? (totalSuccess / entries.length) * 100 : 0,
      avgDurationMs: entries.length > 0 ? totalMs / entries.length : 0,
      topTools: Array.from(toolMap.entries())
        .sort(([, a], [, b]) => b.calls - a.calls)
        .slice(0, 10)
        .map(([toolName, stats]) => ({
          toolName,
          calls: stats.calls,
          successRate: stats.calls > 0 ? (stats.success / stats.calls) * 100 : 0,
          avgDurationMs: stats.calls > 0 ? stats.totalMs / stats.calls : 0,
        })),
      topUsers: Array.from(userMap.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([userId, calls]) => ({ userId, calls })),
      errorSummary: Array.from(toolMap.entries())
        .filter(([, s]) => s.calls - s.success > 0)
        .map(([toolName, s]) => ({
          toolName,
          errorCount: s.calls - s.success,
          commonError: 'See audit logs for details',
        })),
      hourlyDistribution: hourly.map((calls, hour) => ({ hour, calls })),
    };
  }

  async detectAnomalies(windowMinutes = 60): Promise<AnomalyReport> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const recent = await this.query({ startDate: since, limit: 10000 });
    const anomalies: AnomalyReport['anomalies'] = [];
    const threshold = parseInt(process.env['AUDIT_ALERT_THRESHOLD'] ?? '50', 10);

    // Volume anomaly
    const userVolume = new Map<string, number>();
    recent.forEach(e => userVolume.set(e.userId, (userVolume.get(e.userId) ?? 0) + 1));
    userVolume.forEach((count, userId) => {
      if (count > threshold) {
        anomalies.push({
          type: 'unusual_volume',
          severity: count > threshold * 2 ? 'critical' : 'warning',
          userId,
          detail: `${count} tool calls in ${windowMinutes} minutes (threshold: ${threshold})`,
          detectedAt: new Date(),
        });
      }
    });

    // Repeated errors
    const userErrors = new Map<string, number>();
    recent.filter(e => !e.success).forEach(e =>
      userErrors.set(e.userId, (userErrors.get(e.userId) ?? 0) + 1)
    );
    userErrors.forEach((count, userId) => {
      if (count >= 5) {
        anomalies.push({
          type: 'repeated_errors',
          severity: 'warning',
          userId,
          detail: `${count} consecutive errors in ${windowMinutes} minutes`,
          detectedAt: new Date(),
        });
      }
    });

    return { detected: anomalies.length > 0, anomalies };
  }
}

export default AuditQueryService;
