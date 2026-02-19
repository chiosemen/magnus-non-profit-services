/**
 * Magnus MCP Connector — OutputSanitizer
 * Removes PII and sensitive data from tool outputs before sending to Claude
 */

// ─── PII Patterns ─────────────────────────────────────────────────────────────

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_PATTERN = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const BANK_ACCOUNT_PATTERN = /\b[0-9]{8,17}\b/g;
const EMAIL_IN_SENSITIVE_CONTEXT = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_PATTERN = /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const API_KEY_PATTERN = /\b(sk-ant-api|sk-ant|plaid-|access-sandbox|access-production)[A-Za-z0-9_-]+\b/g;

// Fields that should always be redacted regardless of context
const ALWAYS_REDACT_FIELDS = new Set([
  'password', 'password_hash', 'secret', 'api_key', 'access_token',
  'refresh_token', 'private_key', 'ssn', 'social_security_number',
  'credit_card', 'card_number', 'cvv', 'routing_number', 'account_number',
  'plaid_secret', 'jwt', 'bearer_token', 'client_secret',
]);

// Fields safe to include in output
const SAFE_FIELDS = new Set([
  'ein', 'org_name', 'tax_year', 'total_revenue', 'program_ratio',
  'health_score', 'filing_status', 'grant_amount', 'funder_name', 'deadline',
]);

// Reserved for future enhancements (context-aware redaction); referenced to satisfy noUnusedLocals.
void BANK_ACCOUNT_PATTERN;
void EMAIL_IN_SENSITIVE_CONTEXT;
void SAFE_FIELDS;

// ─── Sanitizer ────────────────────────────────────────────────────────────────

export class OutputSanitizer {
  private readonly redactPII: boolean;
  private readonly redactCredentials: boolean;

  constructor(options?: { redactPII?: boolean; redactCredentials?: boolean }) {
    this.redactPII = options?.redactPII ?? true;
    this.redactCredentials = options?.redactCredentials ?? true;
  }

  /**
   * Sanitize any output value — handles strings, objects, arrays
   */
  sanitize<T>(output: T): T {
    if (typeof output === 'string') {
      return this.sanitizeString(output) as unknown as T;
    }
    if (Array.isArray(output)) {
      return output.map(item => this.sanitize(item)) as unknown as T;
    }
    if (output !== null && typeof output === 'object') {
      return this.sanitizeObject(output as Record<string, unknown>) as unknown as T;
    }
    return output;
  }

  /**
   * Sanitize a JSON string output (from tool execute())
   */
  sanitizeJSON(jsonString: string): string {
    try {
      const parsed = JSON.parse(jsonString);
      const sanitized = this.sanitize(parsed);
      return JSON.stringify(sanitized);
    } catch {
      // If not valid JSON, sanitize as plain string
      return this.sanitizeString(jsonString);
    }
  }

  /**
   * Check if a field name should always be redacted
   */
  isRedactedField(fieldName: string): boolean {
    return ALWAYS_REDACT_FIELDS.has(fieldName.toLowerCase());
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  private sanitizeString(str: string): string {
    let result = str;
    if (this.redactCredentials) {
      result = result
        .replace(JWT_PATTERN, '[JWT_REDACTED]')
        .replace(API_KEY_PATTERN, '[API_KEY_REDACTED]');
    }
    if (this.redactPII) {
      result = result
        .replace(SSN_PATTERN, '[SSN_REDACTED]')
        .replace(CREDIT_CARD_PATTERN, '[CARD_REDACTED]')
        .replace(PHONE_PATTERN, '[PHONE_REDACTED]');
    }
    return result;
  }

  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this.isRedactedField(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = this.sanitize(value);
      }
    }
    return result;
  }
}

// Singleton for use throughout the app
let _sanitizer: OutputSanitizer | null = null;
export function getSanitizer(): OutputSanitizer {
  if (!_sanitizer) _sanitizer = new OutputSanitizer();
  return _sanitizer;
}

export default OutputSanitizer;
