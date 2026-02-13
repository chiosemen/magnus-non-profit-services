const SENSITIVE_KEYS = new Set([
  'ssn',
  'ssnEncrypted',
  'plaidAccessToken',
  'DATABASE_URL',
  'JWT_SECRET',
  'token',
  'access_token',
  'refresh_token',
]);

export function redactErrorMessage(err: unknown): string {
  if (err instanceof Error) return redactString(err.message);
  return redactString(String(err));
}

export function redactString(input: string): string {
  // Conservative: do not attempt to parse; just remove obvious URL credentials and long tokens.
  let out = input;
  out = out.replace(/postgresql:\/\/[^@\s]+@/g, 'postgresql://[REDACTED]@');
  out = out.replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[REDACTED]');
  return out;
}

export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const res: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k)) {
      res[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      res[k] = redactObject(v as Record<string, unknown>);
    } else {
      res[k] = v;
    }
  }
  return res;
}

