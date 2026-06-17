import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Campaign model exists with org-scoped unique slug', () => {
  const schemaPath = path.join(__dirname, '..', '..', 'prisma', 'schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert.match(schema, /enum\s+CampaignStatus\s+\{/);
  assert.match(schema, /model\s+Campaign\s+\{/);
  assert.match(schema, /status\s+CampaignStatus\s+@default\(DRAFT\)/);
  assert.match(schema, /@@unique\(\[orgId, slug\]\)/);
});

test('Campaign migration creates enum, table, unique index and org foreign key', () => {
  const migrationsDir = path.join(__dirname, '..', '..', 'prisma', 'migrations');
  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(migrationsDir, d.name, 'migration.sql'))
    .filter(p => fs.existsSync(p));

  const allSql = entries.map(p => fs.readFileSync(p, 'utf8')).join('\n');
  assert.match(allSql, /CREATE TYPE\s+"CampaignStatus"\s+AS ENUM/i);
  assert.match(allSql, /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"Campaign"/i);
  assert.match(allSql, /CREATE UNIQUE INDEX\s+(?:IF NOT EXISTS\s+)?"Campaign_orgId_slug_key"/i);
  assert.match(allSql, /CONSTRAINT\s+"Campaign_orgId_fkey"/i);
});
