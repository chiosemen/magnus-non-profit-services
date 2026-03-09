import { Prisma } from '@prisma/client';
import { encryptNullable, decryptNullable } from './encryption';

/**
 * Helper to detect if a string is already encrypted.
 * Encrypted format: "iv:authTag:ciphertext" (hex-encoded parts)
 */
export function isEncrypted(value: string | null): boolean {
  if (!value) return false;

  // Check for format: hexstring:hexstring:hexstring
  const parts = value.split(':');
  if (parts.length !== 3) return false;

  // Check each part is valid hex
  const hexPattern = /^[0-9a-fA-F]+$/;
  return parts.every((part) => hexPattern.test(part) && part.length > 0);
}

/**
 * Helper to encrypt Worker fields in data objects.
 */
function encryptWorkerFields(data: any): any {
  const result = { ...data };

  if ('ssnEncrypted' in result && result.ssnEncrypted !== undefined) {
    result.ssnEncrypted = encryptNullable(result.ssnEncrypted);
  }

  if ('plaidAccessToken' in result && result.plaidAccessToken !== undefined) {
    result.plaidAccessToken = encryptNullable(result.plaidAccessToken);
  }

  return result;
}

/**
 * Helper to encrypt Organization fields in data objects.
 */
function encryptOrganizationFields(data: any): any {
  const result = { ...data };

  if ('plaidAccessToken' in result && result.plaidAccessToken !== undefined) {
    result.plaidAccessToken = encryptNullable(result.plaidAccessToken);
  }

  return result;
}

/**
 * Prisma Client Extension for transparent field encryption.
 * Automatically encrypts fields on write and decrypts on read.
 *
 * Encrypted fields:
 * - Worker.ssnEncrypted
 * - Worker.plaidAccessToken
 * - Organization.plaidAccessToken
 */
export const encryptionExtension = Prisma.defineExtension({
  name: 'encryptionExtension',

  query: {
    // Worker model - encrypt on write
    worker: {
      // Handle create operations
      async create({ args, query }) {
        if (args.data) {
          args.data = encryptWorkerFields(args.data);
        }
        return query(args);
      },

      // Handle update operations
      async update({ args, query }) {
        if (args.data) {
          args.data = encryptWorkerFields(args.data);
        }
        return query(args);
      },

      // Handle upsert operations
      async upsert({ args, query }) {
        if (args.create) {
          args.create = encryptWorkerFields(args.create);
        }
        if (args.update) {
          args.update = encryptWorkerFields(args.update);
        }
        return query(args);
      },

      // Handle createMany operations
      async createMany({ args, query }) {
        if (args.data) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map(encryptWorkerFields);
          } else {
            args.data = encryptWorkerFields(args.data);
          }
        }
        return query(args);
      },

      // Handle updateMany operations
      async updateMany({ args, query }) {
        if (args.data) {
          args.data = encryptWorkerFields(args.data);
        }
        return query(args);
      },
    },

    // Organization model - encrypt on write
    organization: {
      async create({ args, query }) {
        if (args.data) {
          args.data = encryptOrganizationFields(args.data);
        }
        return query(args);
      },

      async update({ args, query }) {
        if (args.data) {
          args.data = encryptOrganizationFields(args.data);
        }
        return query(args);
      },

      async upsert({ args, query }) {
        if (args.create) {
          args.create = encryptOrganizationFields(args.create);
        }
        if (args.update) {
          args.update = encryptOrganizationFields(args.update);
        }
        return query(args);
      },

      async createMany({ args, query }) {
        if (args.data) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map(encryptOrganizationFields);
          } else {
            args.data = encryptOrganizationFields(args.data);
          }
        }
        return query(args);
      },

      async updateMany({ args, query }) {
        if (args.data) {
          args.data = encryptOrganizationFields(args.data);
        }
        return query(args);
      },
    },
  },

  result: {
    // Worker model - decrypt on read
    worker: {
      ssnEncrypted: {
        needs: { ssnEncrypted: true },
        compute(worker) {
          return decryptNullable(worker.ssnEncrypted);
        },
      },
      plaidAccessToken: {
        needs: { plaidAccessToken: true },
        compute(worker) {
          return decryptNullable(worker.plaidAccessToken);
        },
      },
    },

    // Organization model - decrypt on read
    organization: {
      plaidAccessToken: {
        needs: { plaidAccessToken: true },
        compute(org) {
          return decryptNullable(org.plaidAccessToken);
        },
      },
    },
  },
});
