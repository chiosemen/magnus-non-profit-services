import type { AutonomyTier, Prisma, PrismaClient } from '@magnus/db/types';

export type BoundaryMode = 'internal_only' | 'ask_first' | 'never';

export type AutonomousOpsSettings = {
  orgId: string;
  enabledAgents: string[];
  maxAutonomyTier: AutonomyTier;
  agentBoundaryOverrides: Record<string, BoundaryMode>;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertAutonomousOpsSettingsInput = {
  enabledAgents: string[];
  maxAutonomyTier?: AutonomyTier;
  agentBoundaryOverrides?: Record<string, BoundaryMode>;
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}

function validateOverrides(raw: unknown): Record<string, BoundaryMode> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_BOUNDARY_OVERRIDES');
  const out: Record<string, BoundaryMode> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === 'internal_only' || v === 'ask_first' || v === 'never') out[k] = v;
    else throw new Error('INVALID_BOUNDARY_OVERRIDES');
  }
  return out;
}

function validateMaxTier(raw: unknown): AutonomyTier {
  if (raw === undefined || raw === null) return 'TIER_A_AUTONOMOUS';
  if (raw === 'TIER_A_AUTONOMOUS' || raw === 'TIER_B_ASK_FIRST' || raw === 'TIER_C_NEVER') return raw;
  throw new Error('INVALID_MAX_AUTONOMY_TIER');
}

export class AutonomousOpsSettingsService {
  constructor(private readonly db: PrismaClient) {}

  private async assertOrgExists(orgId: string): Promise<void> {
    const o = await this.db.organization.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!o) throw new Error('ORG_NOT_FOUND');
  }

  async get(orgId: string): Promise<AutonomousOpsSettings> {
    await this.assertOrgExists(orgId);
    const row = await this.db.orgAutonomousOpsSettings.findUnique({
      where: { orgId },
      select: {
        orgId: true,
        enabledAgents: true,
        maxAutonomyTier: true,
        agentBoundaryOverrides: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) {
      // Default: empty enablement; safe-by-default.
      return {
        orgId,
        enabledAgents: [],
        maxAutonomyTier: 'TIER_A_AUTONOMOUS',
        agentBoundaryOverrides: {},
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
    }

    const enabled = isStringArray(row.enabledAgents) ? row.enabledAgents : [];
    const overrides = validateOverrides(row.agentBoundaryOverrides);

    return {
      orgId,
      enabledAgents: enabled,
      maxAutonomyTier: row.maxAutonomyTier,
      agentBoundaryOverrides: overrides,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async upsert(orgId: string, input: UpsertAutonomousOpsSettingsInput): Promise<AutonomousOpsSettings> {
    await this.assertOrgExists(orgId);
    if (!isStringArray(input.enabledAgents)) throw new Error('INVALID_ENABLED_AGENTS');
    const maxAutonomyTier = validateMaxTier(input.maxAutonomyTier);
    const overrides = validateOverrides(input.agentBoundaryOverrides);

    const row = await this.db.orgAutonomousOpsSettings.upsert({
      where: { orgId },
      create: {
        orgId,
        enabledAgents: input.enabledAgents as Prisma.InputJsonValue,
        maxAutonomyTier,
        agentBoundaryOverrides: overrides as Prisma.InputJsonValue,
      },
      update: {
        enabledAgents: input.enabledAgents as Prisma.InputJsonValue,
        maxAutonomyTier,
        agentBoundaryOverrides: overrides as Prisma.InputJsonValue,
      },
      select: {
        orgId: true,
        enabledAgents: true,
        maxAutonomyTier: true,
        agentBoundaryOverrides: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      orgId: row.orgId,
      enabledAgents: input.enabledAgents,
      maxAutonomyTier: row.maxAutonomyTier,
      agentBoundaryOverrides: overrides,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

