/**
 * CLI: print JSON launch readiness for one org.
 * Usage: node dist/launchReadinessCli.js <orgId> [--require-ledger] [--claude-optional]
 * Requires DATABASE_URL in environment.
 */
import prisma from '@magnus/db/client';
import { buildLaunchReadinessReport } from './launchReadiness';

function parseArgs(argv: string[]): {
  orgId: string;
  pilotRequiresLedgerSignal: boolean;
  treatClaudeAsOptional: boolean;
} {
  const rest = argv.slice(2).filter(Boolean);
  if (rest.length === 0) {
    throw new Error('Usage: node dist/launchReadinessCli.js <orgId> [--require-ledger] [--claude-optional]');
  }
  const orgId = rest[0]!;
  let pilotRequiresLedgerSignal = false;
  let treatClaudeAsOptional = false;
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] === '--require-ledger') pilotRequiresLedgerSignal = true;
    if (rest[i] === '--claude-optional') treatClaudeAsOptional = true;
  }
  return { orgId, pilotRequiresLedgerSignal, treatClaudeAsOptional };
}

async function main(): Promise<void> {
  const { orgId, pilotRequiresLedgerSignal, treatClaudeAsOptional } = parseArgs(process.argv);
  const report = await buildLaunchReadinessReport({
    db: prisma as any,
    orgId,
    pilotRequiresLedgerSignal,
    treatClaudeAsOptional,
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
