import bcrypt from 'bcryptjs';

const MIN_PASSWORD_LENGTH = 8;
const SALT_ROUNDS = 12;

function assertPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string') throw new Error('Invalid password');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

function assertHash(hash: unknown): asserts hash is string {
  if (typeof hash !== 'string' || hash.trim().length === 0) throw new Error('Invalid password hash');
}

export async function hashPassword(password: string): Promise<string> {
  assertPassword(password);
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  assertPassword(password);
  assertHash(hash);
  return bcrypt.compare(password, hash);
}

