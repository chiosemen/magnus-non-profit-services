const { spawnSync } = require('child_process');
const path = require('path');

/**
 * Prisma CLI wrapper for Magnus monorepo.
 *
 * Automates DATABASE_URL loading from local .env to eliminate manual exports.
 * Enforces fail-closed behavior if DATABASE_URL is missing.
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm prisma <command> [args]');
    process.exit(2);
  }

  const [command, ...rest] = args;

  // Load environment variables from packages/db/.env
  require('dotenv').config({
    path: path.resolve(__dirname, '../.env')
  });

  // `prisma generate` only needs a syntactically valid URL to resolve env("DATABASE_URL")
  // and emit the client. Keep fail-closed behavior for commands that actually need a live DB.
  if (!process.env.DATABASE_URL) {
    if (command === 'generate') {
      process.env.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/magnus_ci_typegen?schema=public';
    } else {
      console.error('FATAL: DATABASE_URL not set in packages/db/.env');
      console.error('Please ensure the Neon connection string is present.');
      process.exit(1);
    }
  }

  const prismaCli = require.resolve('prisma/build/index.js');
  const schemaPath = path.join('prisma', 'schema.prisma');

  // Certain Prisma commands (like migrate diff) handle schema flags differently
  const skipSchema =
    command === 'migrate' && rest.length > 0 && rest[0] === 'diff';

  const finalArgs = skipSchema
    ? [prismaCli, command, ...rest]
    : [prismaCli, command, ...rest, '--schema', schemaPath];

  // Execute Prisma CLI through the current Node process with inherited I/O
  const res = spawnSync(process.execPath, finalArgs, {
    stdio: 'inherit',
    env: process.env // Explicitly pass the loaded environment
  });

  process.exit(typeof res.status === 'number' ? res.status : 1);
}

main();
