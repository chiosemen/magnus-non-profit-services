#!/usr/bin/env node
/**
 * Operator CLI: activate or deactivate an org after PayPal / Stripe Payment Link settlement.
 *
 * Never pass DATABASE_URL on the CLI argv. The process reads process.env.DATABASE_URL
 * which the operator must export in their shell — this tool does not print it.
 *
 * Confirmation is typed org name (not y/N).
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { prisma } from '@magnus/db/client';
import { activateOrg, deactivateOrg } from '../src/activateOrg.mjs';
import { createPrismaStore } from '../src/prismaStore.mjs';

function usage() {
  console.log(`Usage:
  activate-org --orgId <uuid> --tier STARTER|GROWTH|ENTERPRISE --dealId <id> \\
    --amountMinor <int> --currency USD --paymentMethod paypal_invoice|stripe_payment_link \\
    --paymentReference <ref> --operator <email> [--deactivate]

Environment:
  DATABASE_URL must be set by the operator in the shell (not passed here).
`);
}

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--deactivate') out.deactivate = true;
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
    console.error('DATABASE_URL is not set. Export it in your shell; this CLI will not accept it as an argument.');
    process.exit(2);
  }

  const required = ['orgId', 'tier', 'dealId', 'currency', 'paymentMethod', 'paymentReference', 'operator'];
  for (const k of required) {
    if (!args[k]) {
      console.error(`Missing --${k}`);
      usage();
      process.exit(2);
    }
  }

  const amountMinor = args.deactivate ? 0 : Number(args.amountMinor);
  if (!args.deactivate && !Number.isInteger(amountMinor)) {
    console.error('--amountMinor must be an integer (minor units)');
    process.exit(2);
  }

  const store = createPrismaStore(prisma);
  const org = await prisma.organization.findUnique({
    where: { id: String(args.orgId) },
    select: { id: true, name: true, subscriptionStatus: true, subscriptionTier: true },
  });
  if (!org) {
    console.error('ORG_NOT_FOUND');
    process.exit(1);
  }

  console.log(`Org: ${org.name} (${org.id})`);
  console.log(`Current: tier=${org.subscriptionTier} status=${org.subscriptionStatus}`);
  console.log(`Action: ${args.deactivate ? 'DEACTIVATE' : 'ACTIVATE'} → tier=${args.tier}`);
  console.log('Type the exact organization name to confirm:');

  const rl = createInterface({ input, output });
  const confirmed = (await rl.question('> ')).trimEnd();
  rl.close();

  const inputPayload = {
    orgId: String(args.orgId),
    tier: String(args.tier),
    dealId: String(args.dealId),
    amountMinor,
    currency: String(args.currency),
    paymentMethod: String(args.paymentMethod),
    paymentReference: String(args.paymentReference),
    operator: String(args.operator),
    confirmedOrgName: confirmed,
  };

  try {
    const result = args.deactivate
      ? await deactivateOrg(store, inputPayload)
      : await activateOrg(store, inputPayload);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e.code || e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
