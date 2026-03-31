/** Validation errors for cash-flow forecast normalization (shared @magnus/financial). */

export class MagnusError extends Error {
  public code: string;
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
    if (context !== undefined) this.context = context;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

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
    if (field !== undefined) this.field = field;
    if (value !== undefined) this.value = value;
  }
}

export class RequiredFieldError extends ValidationError {
  constructor(field: string, context?: Record<string, unknown>) {
    super(`Required field is missing: ${field}`, field, undefined, context);
    this.code = 'REQUIRED_FIELD';
  }
}
