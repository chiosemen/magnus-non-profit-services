/**
 * Magnus Nonprofit OS — Custom Error Classes
 * Centralized error hierarchy for consistent handling across MCP + Grant Generator
 */

// ─── Base Error ───────────────────────────────────────────────────────────────

export class MagnusError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode = 500,
    isOperational = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      context: this.context,
    };
  }
}

// ─── Authentication & Authorization ──────────────────────────────────────────

export class AuthError extends MagnusError {
  constructor(message = 'Authentication required', context?: Record<string, unknown>) {
    super(message, 'AUTH_ERROR', 401, true, context);
  }
}

export class TokenExpiredError extends MagnusError {
  constructor(context?: Record<string, unknown>) {
    super('Access token has expired', 'TOKEN_EXPIRED', 401, true, context);
  }
}

export class TokenInvalidError extends MagnusError {
  constructor(context?: Record<string, unknown>) {
    super('Access token is invalid or malformed', 'TOKEN_INVALID', 401, true, context);
  }
}

export class PermissionDeniedError extends MagnusError {
  public readonly requiredPermission: string;

  constructor(requiredPermission: string, context?: Record<string, unknown>) {
    super(
      `Permission denied: ${requiredPermission} is required`,
      'PERMISSION_DENIED',
      403,
      true,
      context
    );
    this.requiredPermission = requiredPermission;
  }
}

export class SessionExpiredError extends MagnusError {
  constructor(context?: Record<string, unknown>) {
    super('Session has expired. Please reconnect.', 'SESSION_EXPIRED', 401, true, context);
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export class ValidationError extends MagnusError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(
    message: string,
    field?: string,
    value?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', 400, true, context);
    this.field = field;
    this.value = value;
  }
}

export class RequiredFieldError extends ValidationError {
  constructor(field: string, context?: Record<string, unknown>) {
    super(`Required field is missing: ${field}`, field, undefined, context);
    this.code = 'REQUIRED_FIELD';
  }
}

export class InvalidFormatError extends ValidationError {
  constructor(field: string, expected: string, received: unknown, context?: Record<string, unknown>) {
    super(
      `Invalid format for ${field}: expected ${expected}`,
      field,
      received,
      context
    );
    this.code = 'INVALID_FORMAT';
  }
}

export class OutOfRangeError extends ValidationError {
  constructor(
    field: string,
    min: number,
    max: number,
    value: number,
    context?: Record<string, unknown>
  ) {
    super(
      `${field} must be between ${min} and ${max}, got ${value}`,
      field,
      value,
      context
    );
    this.code = 'OUT_OF_RANGE';
  }
}

// ─── External Data / API ──────────────────────────────────────────────────────

export class ExternalAPIError extends MagnusError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(
    service: string,
    message: string,
    originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `External API error from ${service}: ${message}`,
      'EXTERNAL_API_ERROR',
      502,
      true,
      context
    );
    this.service = service;
    this.originalError = originalError;
  }
}

export class IRSDataError extends ExternalAPIError {
  constructor(ein: string, message: string, originalError?: Error) {
    super('IRS/ProPublica', message, originalError, { ein });
    this.code = 'IRS_DATA_ERROR';
  }
}

export class CandidAPIError extends ExternalAPIError {
  constructor(message: string, originalError?: Error) {
    super('Candid/GuideStar', message, originalError);
    this.code = 'CANDID_API_ERROR';
  }
}

export class PlaidAPIError extends ExternalAPIError {
  constructor(message: string, originalError?: Error) {
    super('Plaid', message, originalError);
    this.code = 'PLAID_API_ERROR';
  }
}

export class AsanaAPIError extends ExternalAPIError {
  constructor(message: string, originalError?: Error) {
    super('Asana', message, originalError);
    this.code = 'ASANA_API_ERROR';
  }
}

// ─── Data / Resource Not Found ─────────────────────────────────────────────

export class NotFoundError extends MagnusError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string, context?: Record<string, unknown>) {
    super(
      `${resourceType} not found: ${resourceId}`,
      'NOT_FOUND',
      404,
      true,
      context
    );
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

export class OrganizationNotFoundError extends NotFoundError {
  constructor(ein: string) {
    super('Organization', ein, { ein });
    this.code = 'ORGANIZATION_NOT_FOUND';
  }
}

export class GrantApplicationNotFoundError extends NotFoundError {
  constructor(applicationId: string) {
    super('GrantApplication', applicationId);
    this.code = 'GRANT_APPLICATION_NOT_FOUND';
  }
}

// ─── Document Generation ──────────────────────────────────────────────────────

export class DocumentGenerationError extends MagnusError {
  public readonly documentType: string;

  constructor(documentType: string, message: string, context?: Record<string, unknown>) {
    super(
      `Failed to generate ${documentType}: ${message}`,
      'DOCUMENT_GENERATION_ERROR',
      500,
      true,
      context
    );
    this.documentType = documentType;
  }
}

export class TemplateMissingError extends MagnusError {
  constructor(templateName: string) {
    super(
      `Prompt template not found: ${templateName}`,
      'TEMPLATE_MISSING',
      500,
      false
    );
  }
}

// ─── Rate Limiting / Quota ────────────────────────────────────────────────────

export class RateLimitError extends MagnusError {
  public readonly retryAfter: number;

  constructor(retryAfter = 60, context?: Record<string, unknown>) {
    super(
      `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
      'RATE_LIMIT_EXCEEDED',
      429,
      true,
      context
    );
    this.retryAfter = retryAfter;
  }
}

export class QuotaExceededError extends MagnusError {
  constructor(resource: string, limit: number, context?: Record<string, unknown>) {
    super(
      `Quota exceeded for ${resource}. Limit: ${limit}`,
      'QUOTA_EXCEEDED',
      402,
      true,
      context
    );
  }
}

// ─── MCP Protocol ─────────────────────────────────────────────────────────────

export class MCPProtocolError extends MagnusError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MCP_PROTOCOL_ERROR', 400, true, context);
  }
}

export class MCPToolNotFoundError extends MagnusError {
  constructor(toolName: string) {
    super(`MCP tool not found: ${toolName}`, 'MCP_TOOL_NOT_FOUND', 404, true, { toolName });
  }
}

export class MCPTransportError extends MagnusError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MCP_TRANSPORT_ERROR', 503, true, context);
  }
}

// ─── Compliance ───────────────────────────────────────────────────────────────

export class ComplianceError extends MagnusError {
  public readonly filingType?: string;
  public readonly ein?: string;

  constructor(
    message: string,
    filingType?: string,
    ein?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'COMPLIANCE_ERROR', 422, true, context);
    this.filingType = filingType;
    this.ein = ein;
  }
}

export class FilingOverdueError extends ComplianceError {
  constructor(ein: string, filingType: string, daysOverdue: number) {
    super(
      `${filingType} filing is ${daysOverdue} days overdue for EIN ${ein}`,
      filingType,
      ein,
      { daysOverdue }
    );
    this.code = 'FILING_OVERDUE';
  }
}

// ─── Grant ────────────────────────────────────────────────────────────────────

export class GrantProposalError extends MagnusError {
  public readonly sectionType?: string;

  constructor(message: string, sectionType?: string, context?: Record<string, unknown>) {
    super(message, 'GRANT_PROPOSAL_ERROR', 422, true, context);
    this.sectionType = sectionType;
  }
}

export class WordLimitExceededError extends GrantProposalError {
  constructor(sectionType: string, limit: number, actual: number) {
    super(
      `Word limit exceeded for ${sectionType}: limit is ${limit}, got ${actual}`,
      sectionType,
      { limit, actual }
    );
    this.code = 'WORD_LIMIT_EXCEEDED';
  }
}

// ─── Database ─────────────────────────────────────────────────────────────────

export class DatabaseError extends MagnusError {
  public readonly operation?: string;

  constructor(message: string, operation?: string, context?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', 500, false, context);
    this.operation = operation;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Type guard — check if unknown is a MagnusError
 */
export function isMagnusError(err: unknown): err is MagnusError {
  return err instanceof MagnusError;
}

/**
 * Wrap any unknown error as a MagnusError for consistent handling
 */
export function toMagnusError(err: unknown): MagnusError {
  if (isMagnusError(err)) return err;
  if (err instanceof Error) {
    return new MagnusError(err.message, 'UNKNOWN_ERROR', 500, false);
  }
  return new MagnusError(String(err), 'UNKNOWN_ERROR', 500, false);
}

/**
 * Assert condition, throw ValidationError if false
 */
export function assert(
  condition: boolean,
  field: string,
  message: string
): asserts condition {
  if (!condition) throw new ValidationError(message, field);
}
