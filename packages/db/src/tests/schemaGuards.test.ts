import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDbShape, MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE, type QueryableDb } from '../schemaGuards';

test('assertDbShape fails closed when required table is missing', async () => {
  const db: QueryableDb = {
    $queryRawUnsafe: async (q: string, ...values: any[]) => {
      if (q.includes('information_schema.columns')) {
        const table = values[0];
        if (table === 'Alert') return []; // missing table
        return [{ column_name: 'id' }]; // minimal presence for others
      }
      if (q.includes('pg_enum')) return [{ enumlabel: 'OPEN' }];
      return [];
    },
  };

  await assert.rejects(
    () => assertDbShape(db, MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE),
    (err: any) => err instanceof Error && err.message.includes('DB_SCHEMA_INCOMPATIBLE:magnus_accord_autonomous_ops'),
  );
});

test('assertDbShape fails closed when enum values are missing', async () => {
  const db: QueryableDb = {
    $queryRawUnsafe: async (q: string, ...values: any[]) => {
      if (q.includes('information_schema.columns')) {
        // Pretend all required columns exist by returning the requested column names for the table.
        // This is sufficient for guard behavior testing without duplicating full schema.
        return (MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE.tables
          .find(t => t.table === values[0])?.requiredColumns ?? ['id']).map(column_name => ({ column_name }));
      }
      if (q.includes('pg_enum')) {
        const enumName = values[0];
        if (enumName === 'AlertStatus') return [{ enumlabel: 'OPEN' }]; // missing others
        return [{ enumlabel: 'USER' }, { enumlabel: 'AGENT' }, { enumlabel: 'SYSTEM' }];
      }
      return [];
    },
  };

  await assert.rejects(
    () => assertDbShape(db, MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE),
    /missing_enum_value:AlertStatus\.ACKNOWLEDGED/,
  );
});

