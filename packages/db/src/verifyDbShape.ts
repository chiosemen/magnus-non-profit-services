import prisma from './client';
import { assertDbShape, MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE } from './schemaGuards';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main(): Promise<void> {
  const profile = parseArg('profile') ?? 'autonomous_ops';
  if (profile !== 'autonomous_ops') {
    throw new Error('Invalid --profile. Expected autonomous_ops.');
  }

  await prisma.$queryRawUnsafe('SELECT 1');
  await assertDbShape(prisma, MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE);
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

