#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const migrationsRoot = path.join(repoRoot, 'packages', 'db', 'prisma', 'migrations');

const BANNED_PATTERNS = [
  { re: /\bDROP\s+TABLE\b/i, label: 'DROP TABLE' },
  { re: /\bDROP\s+COLUMN\b/i, label: 'DROP COLUMN' },
  { re: /\bRENAME\s+COLUMN\b/i, label: 'RENAME COLUMN' },
];

// Catch accidental CLI output / non-SQL artifacts.
const NON_SQL_PATTERNS = [
  { re: /(^|\n)\s*>[^\n]*\n?/m, label: 'CLI output (>)' },
  { re: /\bELIFECYCLE\b/, label: 'ELIFECYCLE output' },
  { re: /\bERR_PNPM\b/, label: 'pnpm error output' },
];

function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function main() {
  if (!fs.existsSync(migrationsRoot)) {
    console.error(`Missing migrations dir: ${migrationsRoot}`);
    process.exit(1);
  }

  const files = walk(migrationsRoot).filter(p => path.basename(p) === 'migration.sql');
  if (files.length === 0) {
    console.error('No migration.sql files found under packages/db/prisma/migrations/');
    process.exit(1);
  }

  /** @type {Array<{file: string; matches: string[]}>} */
  const failures = [];

  for (const file of files) {
    const sql = fs.readFileSync(file, 'utf8');
    /** @type {string[]} */
    const matches = [];

    for (const p of [...BANNED_PATTERNS, ...NON_SQL_PATTERNS]) {
      if (p.re.test(sql)) matches.push(p.label);
    }

    if (matches.length > 0) {
      failures.push({ file: path.relative(repoRoot, file), matches });
    }
  }

  if (failures.length > 0) {
    console.error('Migration validation failed (additive-only policy).');
    for (const f of failures) {
      console.error(`- ${f.file}: ${f.matches.join(', ')}`);
    }
    process.exit(1);
  }

  console.log(`Migration validation passed (${files.length} migration.sql files).`);
}

main();

