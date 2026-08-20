#!/usr/bin/env node
/**
 * Operator CLI: create a PENDING organization (no entitlement).
 * Activation is a separate audited step via activate-org.
 */
import { prisma } from '@magnus/db/client';
import { createPendingOrg } from '../src/createOrg.mjs';
import { createPrismaStore } from '../src/prismaStore.mjs';

function usage() {
  console.log(`Usage:
  create-org --name "<legal name>" --ein "<EIN>" [--tier STARTER|GROWTH|ENTERPRISE]

Creates subscriptionStatus=PENDING. Does not grant entitlement.
DATABASE_URL must be set in the environment by the operator.
`);
}

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(2);
  }
  if (!args.name || !args.ein) {
    usage();
    process.exit(2);
  }

  const store = createPrismaStore(prisma);
  try {
    const org = await createPendingOrg(store, {
      name: String(args.name),
      ein: String(args.ein),
      subscriptionTier: args.tier ? String(args.tier) : 'STARTER',
    });
    console.log(JSON.stringify(org, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e.code || e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
