import { Prisma } from '@prisma/client';
import crypto from 'crypto';

// The encryption key from env (must be 32 bytes hex = 64 characters)
function getSecretKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY must be a 64-character hex string in production');
    }
    // Fallback for local development if not provided, but warn
    return crypto.scryptSync('development-fallback-key-do-not-use-in-prod', 'salt', 32);
  }
  return Buffer.from(key, 'hex');
}

// AES-256-GCM encryption
export function encryptValue(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// Detects if a string matches the iv:authTag:cipher format
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  const [iv, authTag, cipher] = parts;
  if (!iv || !authTag || !cipher) return false;
  // Basic hex validation
  const hexHex = /^[0-9a-f]+$/i;
  return hexHex.test(iv) && hexHex.test(authTag) && hexHex.test(cipher);
}

export function decryptValue(encryptedValue: string): string {
  if (!encryptedValue.includes(':')) {
    // Return raw if it doesn't match our format (e.g., legacy plaintext)
    return encryptedValue;
  }
  
  try {
    const [ivHex, authTagHex, encryptedHash] = encryptedValue.split(':');
    if (!ivHex || !authTagHex || !encryptedHash) return encryptedValue;

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getSecretKey(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    
    let decrypted = decipher.update(encryptedHash, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    // If decryption fails, return original or throw
    return encryptedValue;
  }
}

// The fields we want to encrypt across any model
const ENCRYPTED_FIELDS = ['plaidAccessToken', 'ssnEncrypted'];

function encryptArgs(args: any): any {
  if (!args || typeof args !== 'object') return args;
  
  // Create a deep copy to avoid mutating Original references
  const result = { ...args };
  
  if (result.data) {
    result.data = { ...result.data };
    for (const field of ENCRYPTED_FIELDS) {
      if (typeof result.data[field] === 'string') {
        result.data[field] = encryptValue(result.data[field] as string);
      }
    }
  }
  
  if (result.where) {
    // Encrypting WHERE clauses is tricky for exact matches, but typically we 
    // don't search by SSN or access token directly. If we do, we'd need to mock it.
    // For now, we skip encrypting `where` because IV is random, so exact match fails.
    // The architecture should avoid looking up by these fields.
  }

  return result;
}

function decryptResult(result: any): any {
  if (!result) return result;
  
  if (Array.isArray(result)) {
    return result.map(decryptResult);
  }
  
  if (typeof result === 'object') {
    const decrypted = { ...result };
    for (const field of ENCRYPTED_FIELDS) {
      if (typeof decrypted[field] === 'string') {
        decrypted[field] = decryptValue(decrypted[field] as string);
      }
    }
    
    // Also decrypt any nested relations
    for (const key of Object.keys(decrypted)) {
      if (typeof decrypted[key] === 'object' && decrypted[key] !== null) {
        decrypted[key] = decryptResult(decrypted[key]);
      }
    }
    return decrypted;
  }
  
  return result;
}

export const encryptionExtension = Prisma.defineExtension({
  name: 'encryption',
  query: {
    $allModels: {
      async create({ args, query }) {
        return decryptResult(await query(encryptArgs(args)));
      },
      async createMany({ args, query }) {
        if (args.data && Array.isArray(args.data)) {
          args.data = args.data.map((item: any) => {
            const newItem = { ...item };
            for (const field of ENCRYPTED_FIELDS) {
              if (typeof newItem[field] === 'string') {
                newItem[field] = encryptValue(newItem[field]);
              }
            }
            return newItem;
          });
        }
        return query(args); // createMany returns a count
      },
      async update({ args, query }) {
        return decryptResult(await query(encryptArgs(args)));
      },
      async updateMany({ args, query }) {
        return query(encryptArgs(args)); // returns a count
      },
      async upsert({ args, query }) {
        if (args.create) {
          const createArgs = encryptArgs({ data: args.create });
          args.create = createArgs.data;
        }
        if (args.update) {
          const updateArgs = encryptArgs({ data: args.update });
          args.update = updateArgs.data;
        }
        return decryptResult(await query(args));
      },
      async findUnique({ args, query }) {
        return decryptResult(await query(args));
      },
      async findUniqueOrThrow({ args, query }) {
        return decryptResult(await query(args));
      },
      async findFirst({ args, query }) {
        return decryptResult(await query(args));
      },
      async findFirstOrThrow({ args, query }) {
        return decryptResult(await query(args));
      },
      async findMany({ args, query }) {
        return decryptResult(await query(args));
      },
    },
  },
});
