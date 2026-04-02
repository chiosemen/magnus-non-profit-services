import { prisma } from '../db';
import type { AlertEvent } from '../contracts/events';
import type { AlertSeverity, AgentScopeType, Prisma } from '@magnus/db/types';
import type { AlertSink } from './AlertSink';
import { randomUUID } from 'node:crypto';

const ALERT_SEVERITIES = ['LOW', 'MED', 'HIGH', 'CRITICAL'] as const satisfies readonly AlertSeverity[];

function mapSeverity(sev: AlertEvent['severity']): AlertSeverity {
  if (!ALERT_SEVERITIES.includes(sev as AlertSeverity)) {
    throw new Error('INVALID_ALERT_SEVERITY');
  }
  return sev as AlertSeverity;
}

function mapScopeType(scopeType: AlertEvent['scopeType']): AgentScopeType {
  if (scopeType === 'org') return 'ORG';
  if (scopeType === 'worker') return 'WORKER';
  return 'GRANT';
}

type RecommendedAction =
  | string
  | {
      label: string;
      kind?: string;
      url?: string;
      sourceRefs?: unknown;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertValidRecommendedActions(raw: unknown): asserts raw is RecommendedAction[] {
  if (!Array.isArray(raw)) throw new Error('INVALID_RECOMMENDED_ACTIONS');
  for (const item of raw) {
    if (typeof item === 'string') continue;
    if (!isPlainObject(item)) throw new Error('INVALID_RECOMMENDED_ACTIONS');
    if (typeof item['label'] !== 'string' || item['label'].length === 0) throw new Error('INVALID_RECOMMENDED_ACTIONS');
    if (item['kind'] !== undefined && typeof item['kind'] !== 'string') throw new Error('INVALID_RECOMMENDED_ACTIONS');
    if (item['url'] !== undefined && typeof item['url'] !== 'string') throw new Error('INVALID_RECOMMENDED_ACTIONS');
    // sourceRefs is intentionally left as unknown, but must remain JSON-serializable at write time.
  }
}

export class DbAlertSink implements AlertSink {
  private readonly db: typeof prisma;

  constructor(db: typeof prisma = prisma) {
    this.db = db;
  }

  async emit(event: AlertEvent): Promise<void> {
    assertValidRecommendedActions(event.recommendedActions);
    const scopeType = mapScopeType(event.scopeType);
    const scopeId = event.scopeId;
    const type = event.type;
    const dedupeKey = event.dedupeKey;

    // Enforce dedupeKey idempotency for the same scope+type.
    // If a dedupeKey collision occurs across different scopes/types, fail closed.
    const existing = await this.db.alert.findUnique({
      where: { dedupeKey },
      select: { scopeType: true, scopeId: true, type: true },
    });
    if (existing) {
      const same =
        existing.scopeType === scopeType &&
        existing.scopeId === scopeId &&
        existing.type === type;
      if (same) return;
      throw new Error('ALERT_DEDUPEKEY_COLLISION');
    }

    try {
      const created = await this.db.alert.create({
        data: {
          agentName: event.agentName,
          scopeType,
          scopeId,
          severity: mapSeverity(event.severity),
          status: 'OPEN',
          type,
          title: event.title,
          body: event.body,
          recommendedActions: event.recommendedActions as Prisma.InputJsonValue,
          dedupeKey,
          createdAt: new Date(),
        },
        select: { id: true },
      });
      await this.db.alertAuditEntry.create({
        data: {
          id: randomUUID(),
          alertId: created.id,
          action: 'CREATED',
          fromStatus: null,
          toStatus: 'OPEN',
          actorType: 'agent',
          actorName: event.agentName,
          detail: { dedupeKey } as Prisma.InputJsonValue,
        },
      });
    } catch (err: any) {
      // P2002 unique constraint: handle races by checking if it's the same scope+type.
      if (err?.code === 'P2002') {
        const row = await this.db.alert.findUnique({
          where: { dedupeKey },
          select: { scopeType: true, scopeId: true, type: true },
        });
        const same =
          row &&
          row.scopeType === scopeType &&
          row.scopeId === scopeId &&
          row.type === type;
        if (same) return;
        throw new Error('ALERT_DEDUPEKEY_COLLISION');
      }
      throw err;
    }
  }
}
