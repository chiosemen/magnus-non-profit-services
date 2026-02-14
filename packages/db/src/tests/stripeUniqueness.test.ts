import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Organization Stripe IDs are marked unique in Prisma schema', () => {
  const schemaPath = path.join(__dirname, '..', '..', 'prisma', 'schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  assert.match(schema, /stripeCustomerId\s+String\?\s+@unique/);
  assert.match(schema, /stripeSubscriptionId\s+String\?\s+@unique/);
});

test('migration creates unique indexes for Organization Stripe IDs', () => {
  const migrationsDir = path.join(__dirname, '..', '..', 'prisma', 'migrations');
  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(migrationsDir, d.name, 'migration.sql'))
    .filter(p => fs.existsSync(p));

  const allSql = entries.map(p => fs.readFileSync(p, 'utf8')).join('\n');
  assert.match(allSql, /CREATE\s+UNIQUE\s+INDEX[\s\S]*\"Organization\"\s*\(\s*\"stripeCustomerId\"\s*\)/i);
  assert.match(allSql, /CREATE\s+UNIQUE\s+INDEX[\s\S]*\"Organization\"\s*\(\s*\"stripeSubscriptionId\"\s*\)/i);
});
