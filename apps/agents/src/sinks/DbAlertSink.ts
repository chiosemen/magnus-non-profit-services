import { prisma } from '../db';
import type { AlertEvent } from '../contracts/events';
import type { AlertSeverity, AgentScopeType, Prisma } from '@magnus/db/types';
import type { AlertSink } from './AlertSink';

function mapSeverity(sev: AlertEvent['severity']): AlertSeverity {
  return sev as AlertSeverity;
}

function mapScopeType(scopeType: AlertEvent['scopeType']): AgentScopeType {
  if (scopeType === 'org') return 'ORG';
  if (scopeType === 'worker') return 'WORKER';
  return 'GRANT';
}

export class DbAlertSink implements AlertSink {
  private readonly db: typeof prisma;

  constructor(db: typeof prisma = prisma) {
    this.db = db;
  }

  async emit(event: AlertEvent): Promise<void> {
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
      await this.db.alert.create({
        data: {
          scopeType,
          scopeId,
          severity: mapSeverity(event.severity),
          type,
          title: event.title,
          body: event.body,
          recommendedActions: event.recommendedActions as Prisma.InputJsonValue,
          dedupeKey,
          createdAt: new Date(),
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
