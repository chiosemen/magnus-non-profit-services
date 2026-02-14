/* eslint-disable no-console */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { spawnSync } = require('child_process');
const path = require('path');

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm --filter @magnus/db prisma <command> [args]');
    process.exit(2);
  }

  const prismaCli = require.resolve('prisma/build/index.js');
  const schemaPath = path.join('prisma', 'schema.prisma');

  const [command, ...rest] = args;
  // prisma migrate diff does not accept the global --schema flag in some Prisma versions.
  const skipSchema =
    command === 'migrate' && rest.length > 0 && rest[0] === 'diff';
  const finalArgs = skipSchema
    ? [prismaCli, command, ...rest]
    : [prismaCli, command, ...rest, '--schema', schemaPath];
  const res = spawnSync(process.execPath, finalArgs, { stdio: 'inherit' });
  process.exit(typeof res.status === 'number' ? res.status : 1);
}

main();
