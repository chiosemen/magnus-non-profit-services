import { PrismaClient } from '@magnus/db/types';

export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres@localhost/magnus';

function getTestDatabaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
}

export async function canConnectToDb(
  requiredColumns: Array<{ table: string; column: string }> = [],
): Promise<boolean> {
  const testClient = new PrismaClient({
    datasources: { db: { url: getTestDatabaseUrl() } },
  });

  try {
    await testClient.$queryRaw`SELECT 1`;

    for (const requirement of requiredColumns) {
      const rows = await testClient.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND lower(table_name) = lower(${requirement.table})
            AND lower(column_name) = lower(${requirement.column})
        ) AS "exists"
      `;

      if (!rows[0]?.exists) return false;
    }

    return true;
  } catch {
    return false;
  } finally {
    await testClient.$disconnect().catch(() => {});
  }
}
