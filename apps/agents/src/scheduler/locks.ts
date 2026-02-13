import crypto from 'crypto';
import { prisma } from '../db';

type RawQueryable = {
  $queryRaw: any;
};

function lockId(key: string): bigint {
  const buf = crypto.createHash('sha256').update(key, 'utf8').digest();
  // Signed 64-bit integer.
  return buf.readBigInt64BE(0);
}

export async function tryAdvisoryLock(
  key: string,
  db: RawQueryable = prisma,
): Promise<{ acquired: boolean; release: () => Promise<void> }> {
  const id = lockId(key);
  const rows = await (db as any).$queryRaw`SELECT pg_try_advisory_lock(${id}) as locked`;
  const acquired = Boolean(rows[0]?.locked);
  return {
    acquired,
    release: async () => {
      if (!acquired) return;
      await (db as any).$queryRaw`SELECT pg_advisory_unlock(${id})`;
    },
  };
}
