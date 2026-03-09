#!/usr/bin/env node
'use strict';

// Load environment variables
require('dotenv/config');

const path = require('path');

// Resolve paths
const repoRoot = path.resolve(__dirname, '..');

// Import from pnpm node_modules
const { PrismaClient } = require(path.join(repoRoot, 'node_modules', '.pnpm', 'node_modules', '@prisma', 'client'));

// Import encryption functions from the built package
const { encryptNullable } = require(path.join(repoRoot, 'packages', 'db', 'dist', 'encryption.js'));

// Use base Prisma client WITHOUT encryption extension for migration
// This allows us to read/write raw encrypted values
const prisma = new PrismaClient();

/**
 * Helper to detect if a string is already encrypted.
 * Encrypted format: "iv:authTag:ciphertext" (hex-encoded parts)
 */
function isEncrypted(value) {
  if (!value) return false;

  // Check for format: hexstring:hexstring:hexstring
  const parts = value.split(':');
  if (parts.length !== 3) return false;

  // Check each part is valid hex
  const hexPattern = /^[0-9a-fA-F]+$/;
  return parts.every((part) => hexPattern.test(part) && part.length > 0);
}

async function migrateWorkers(dryRun) {
  const stats = {
    workersProcessed: 0,
    workersSkipped: 0,
    workersEncrypted: 0,
    organizationsProcessed: 0,
    organizationsSkipped: 0,
    organizationsEncrypted: 0,
    errors: [],
  };

  console.log('\n=== Migrating Worker Records ===\n');

  // Fetch all workers with sensitive fields
  const workers = await prisma.worker.findMany({
    select: {
      id: true,
      email: true,
      ssnEncrypted: true,
      plaidAccessToken: true,
    },
  });

  console.log(`Found ${workers.length} workers to process`);

  for (const worker of workers) {
    stats.workersProcessed++;

    let needsUpdate = false;
    const updates = {};

    // Check ssnEncrypted
    if (worker.ssnEncrypted !== null) {
      if (isEncrypted(worker.ssnEncrypted)) {
        console.log(`  [${worker.id}] ssnEncrypted already encrypted - skipping`);
      } else {
        console.log(`  [${worker.id}] ssnEncrypted needs encryption`);
        updates.ssnEncrypted = encryptNullable(worker.ssnEncrypted);
        needsUpdate = true;
      }
    }

    // Check plaidAccessToken
    if (worker.plaidAccessToken !== null) {
      if (isEncrypted(worker.plaidAccessToken)) {
        console.log(`  [${worker.id}] plaidAccessToken already encrypted - skipping`);
      } else {
        console.log(`  [${worker.id}] plaidAccessToken needs encryption`);
        updates.plaidAccessToken = encryptNullable(worker.plaidAccessToken);
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      if (dryRun) {
        console.log(`  [DRY RUN] Would encrypt fields for worker ${worker.id} (${worker.email})`);
        stats.workersEncrypted++;
      } else {
        try {
          await prisma.worker.update({
            where: { id: worker.id },
            data: updates,
          });
          console.log(`  [SUCCESS] Encrypted fields for worker ${worker.id} (${worker.email})`);
          stats.workersEncrypted++;
        } catch (error) {
          const errorMsg = error.message || String(error);
          console.error(`  [ERROR] Failed to encrypt worker ${worker.id}: ${errorMsg}`);
          stats.errors.push({
            type: 'worker',
            id: worker.id,
            error: errorMsg,
          });
        }
      }
    } else {
      stats.workersSkipped++;
    }
  }

  return stats;
}

async function migrateOrganizations(dryRun, stats) {
  console.log('\n=== Migrating Organization Records ===\n');

  // Fetch all organizations with plaidAccessToken
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      ein: true,
      plaidAccessToken: true,
    },
  });

  console.log(`Found ${orgs.length} organizations to process`);

  for (const org of orgs) {
    stats.organizationsProcessed++;

    if (org.plaidAccessToken !== null) {
      if (isEncrypted(org.plaidAccessToken)) {
        console.log(`  [${org.id}] plaidAccessToken already encrypted - skipping`);
        stats.organizationsSkipped++;
      } else {
        console.log(`  [${org.id}] plaidAccessToken needs encryption`);

        if (dryRun) {
          console.log(`  [DRY RUN] Would encrypt plaidAccessToken for org ${org.id} (${org.name})`);
          stats.organizationsEncrypted++;
        } else {
          try {
            await prisma.organization.update({
              where: { id: org.id },
              data: {
                plaidAccessToken: encryptNullable(org.plaidAccessToken),
              },
            });
            console.log(`  [SUCCESS] Encrypted plaidAccessToken for org ${org.id} (${org.name})`);
            stats.organizationsEncrypted++;
          } catch (error) {
            const errorMsg = error.message || String(error);
            console.error(`  [ERROR] Failed to encrypt org ${org.id}: ${errorMsg}`);
            stats.errors.push({
              type: 'organization',
              id: org.id,
              error: errorMsg,
            });
          }
        }
      }
    } else {
      stats.organizationsSkipped++;
    }
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('========================================');
  console.log('Sensitive Fields Encryption Migration');
  console.log('========================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('========================================\n');

  if (dryRun) {
    console.log('\u26A0\uFE0F  DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('\u26A0\uFE0F  LIVE MODE - Database will be modified!\n');
    console.log('Waiting 5 seconds... Press Ctrl+C to cancel\n');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // Verify encryption key is configured
  try {
    const testValue = 'test';
    const encrypted = encryptNullable(testValue);
    if (!encrypted) {
      throw new Error('Encryption returned null for test value');
    }
    console.log('\u2713 Encryption key validated\n');
  } catch (error) {
    console.error('\u2717 Encryption key validation failed:', error);
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    // Migrate workers
    const stats = await migrateWorkers(dryRun);

    // Migrate organizations
    await migrateOrganizations(dryRun, stats);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Print summary
    console.log('\n========================================');
    console.log('Migration Summary');
    console.log('========================================');
    console.log(`Workers processed: ${stats.workersProcessed}`);
    console.log(`Workers encrypted: ${stats.workersEncrypted}`);
    console.log(`Workers skipped: ${stats.workersSkipped}`);
    console.log(`Organizations processed: ${stats.organizationsProcessed}`);
    console.log(`Organizations encrypted: ${stats.organizationsEncrypted}`);
    console.log(`Organizations skipped: ${stats.organizationsSkipped}`);
    console.log(`Errors: ${stats.errors.length}`);
    console.log(`Duration: ${duration}s`);
    console.log('========================================\n');

    if (stats.errors.length > 0) {
      console.log('Errors encountered:');
      stats.errors.forEach((err) => {
        console.log(`  - ${err.type} ${err.id}: ${err.error}`);
      });
      process.exit(1);
    }

    if (dryRun) {
      console.log('\u2713 Dry run completed successfully');
      console.log('  Run without --dry-run to apply changes\n');
    } else {
      console.log('\u2713 Migration completed successfully\n');
    }
  } catch (error) {
    console.error('\n\u2717 Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
