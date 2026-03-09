import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Encrypts plaintext using AES-256-GCM (Authenticated Encryption with Associated Data).
 *
 * Format: iv:authTag:ciphertext (all hex-encoded)
 *
 * @param plaintext - The plaintext string to encrypt
 * @returns Encrypted string in format "iv:authTag:ciphertext"
 * @throws Error if ENCRYPTION_KEY environment variable is not set
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypts ciphertext encrypted with AES-256-GCM.
 *
 * @param encrypted - The encrypted string in format "iv:authTag:ciphertext"
 * @returns Decrypted plaintext string
 * @throws Error if encrypted format is invalid or authentication fails
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format: expected "iv:authTag:ciphertext"');
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Encrypts a nullable field (returns null if input is null).
 *
 * @param plaintext - The plaintext string to encrypt, or null
 * @returns Encrypted string or null
 */
export function encryptNullable(plaintext: string | null): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  return encrypt(plaintext);
}

/**
 * Decrypts a nullable field (returns null if input is null).
 *
 * @param encrypted - The encrypted string, or null
 * @returns Decrypted plaintext string or null
 */
export function decryptNullable(encrypted: string | null): string | null {
  if (encrypted === null || encrypted === undefined) return null;
  return decrypt(encrypted);
}

/**
 * Gets the encryption key from environment variable.
 *
 * @returns 32-byte encryption key as Buffer
 * @throws Error if ENCRYPTION_KEY is not set or invalid
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env['ENCRYPTION_KEY'];

  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable not set');
  }

  // Validate key format (64 hex chars = 32 bytes for AES-256)
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes for AES-256)');
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Validates that the encryption key is properly configured.
 * Call this during app startup to fail-fast if encryption is misconfigured.
 *
 * @throws Error if ENCRYPTION_KEY is not set or invalid
 */
export function validateEncryptionKey(): void {
  getEncryptionKey(); // Will throw if invalid
}
