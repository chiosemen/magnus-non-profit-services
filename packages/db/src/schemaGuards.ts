export type QueryableDb = {
  // Deliberately untyped return: callers cast to expected row shape.
  // This keeps the guard mockable without depending on Prisma's generics.
  $queryRawUnsafe(query: string, ...values: any[]): Promise<any>;
};

export type TableShapeRequirement = {
  table: string;
  requiredColumns: string[];
};

type EnumRequirement = {
  enumName: string;
  requiredValues: string[];
};

export type DbShapeProfile = {
  name: string;
  tables: TableShapeRequirement[];
  enums?: EnumRequirement[];
};

async function fetchColumnNames(db: QueryableDb, table: string): Promise<Set<string>> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    table,
  )) as Array<{ column_name: string }> | null | undefined;
  return new Set((rows ?? []).map(r => r.column_name));
}

async function fetchEnumLabels(db: QueryableDb, enumName: string): Promise<Set<string>> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT e.enumlabel
     FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = $1
     ORDER BY e.enumsortorder`,
    enumName,
  )) as Array<{ enumlabel: string }> | null | undefined;
  return new Set((rows ?? []).map(r => r.enumlabel));
}

export async function assertDbShape(db: QueryableDb, profile: DbShapeProfile): Promise<void> {
  // Fail-closed: if information_schema is unavailable or query fails, caller will throw.
  const failures: string[] = [];

  for (const req of profile.tables) {
    const cols = await fetchColumnNames(db, req.table);
    if (cols.size === 0) {
      failures.push(`missing_table:${req.table}`);
      continue;
    }
    for (const col of req.requiredColumns) {
      if (!cols.has(col)) failures.push(`missing_column:${req.table}.${col}`);
    }
  }

  for (const er of profile.enums ?? []) {
    const labels = await fetchEnumLabels(db, er.enumName);
    if (labels.size === 0) {
      failures.push(`missing_enum:${er.enumName}`);
      continue;
    }
    for (const v of er.requiredValues) {
      if (!labels.has(v)) failures.push(`missing_enum_value:${er.enumName}.${v}`);
    }
  }

  if (failures.length > 0) {
    const detail = failures.sort().join(',');
    throw new Error(`DB_SCHEMA_INCOMPATIBLE:${profile.name}:${detail}`);
  }
}

export const MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE: DbShapeProfile = {
  name: 'magnus_accord_autonomous_ops',
  tables: [
    {
      table: 'AgentRun',
      requiredColumns: ['id', 'agentName', 'scopeType', 'scopeId', 'windowStart', 'windowEnd', 'status', 'autonomyTier', 'requiresHumanReview'],
    },
    {
      table: 'Alert',
      requiredColumns: [
        'id',
        'agentName',
        'scopeType',
        'scopeId',
        'severity',
        'status',
        'type',
        'title',
        'body',
        'recommendedActions',
        'dedupeKey',
        'createdAt',
        'acknowledgedAt',
        'resolvedAt',
        'resolutionSummary',
        'ownerType',
        'ownerId',
        'ownerName',
        'relatedAgentRunId',
        'relatedHandoffId',
      ],
    },
    { table: 'AlertAuditEntry', requiredColumns: ['id', 'alertId', 'createdAt', 'action', 'actorType'] },
    { table: 'AgentHandoff', requiredColumns: ['id', 'orgId', 'fromAgentName', 'toAgentName', 'status', 'createdAt'] },
    { table: 'AgentHandoffAuditEntry', requiredColumns: ['id', 'handoffId', 'createdAt', 'action', 'actorType'] },
    { table: 'OrgContextFile', requiredColumns: ['id', 'orgId', 'kind', 'content', 'updatedAt'] },
    { table: 'AgentOperationalMemoryEntry', requiredColumns: ['id', 'orgId', 'agentName', 'kind', 'payload', 'createdAt'] },
    { table: 'OrgCuratedMemoryItem', requiredColumns: ['id', 'orgId', 'body', 'confidence', 'isActive'] },
    { table: 'OrgSemanticMemoryChunk', requiredColumns: ['id', 'orgId', 'chunkText', 'embeddingReady'] },
    { table: 'OrgAutonomousOpsSettings', requiredColumns: ['id', 'orgId', 'enabledAgents', 'maxAutonomyTier'] },
    {
      table: 'DonorEvent',
      requiredColumns: [
        'id',
        'orgId',
        'occurredAt',
        'amount',
        'currency',
        'sourceSystem',
        'sourceRef',
        'createdAt',
      ],
    },
    {
      table: 'VolunteerEvent',
      requiredColumns: [
        'id',
        'orgId',
        'occurredAt',
        'hours',
        'sourceSystem',
        'sourceRef',
        'createdAt',
      ],
    },
  ],
  enums: [
    { enumName: 'AlertStatus', requiredValues: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'] },
    { enumName: 'AlertOwnerType', requiredValues: ['USER', 'AGENT', 'SYSTEM'] },
  ],
};

