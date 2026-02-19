import crypto from 'crypto';

type RawQueryable = {
  $queryRaw: any;
};

function lockId(key: string): bigint {
  const buf = crypto.createHash('sha256').update(key, 'utf8').digest();
  // Signed 64-bit integer.
  return buf.readBigInt64BE(0);
}

export async function tryAdvisoryXactLock(
  key: string,
  db: RawQueryable,
): Promise<boolean> {
  const id = lockId(key);
  const rows = await (db as any).$queryRaw`SELECT pg_try_advisory_xact_lock(${id}) as locked`;
  return Boolean(rows[0]?.locked);
}
