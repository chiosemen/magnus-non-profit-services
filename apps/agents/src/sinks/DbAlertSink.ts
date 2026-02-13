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
    try {
      await this.db.alert.create({
        data: {
          scopeType: mapScopeType(event.scopeType),
          scopeId: event.scopeId,
          severity: mapSeverity(event.severity),
          type: event.type,
          title: event.title,
          body: event.body,
          recommendedActions: event.recommendedActions as Prisma.InputJsonValue,
          dedupeKey: event.dedupeKey,
          createdAt: new Date(),
        },
      });
    } catch (err: any) {
      // P2002 unique constraint: dedupeKey already exists => idempotent no-op.
      if (err?.code === 'P2002') return;
      throw err;
    }
  }
}
