/**
 * Minimal error types used by the Grant Generator.
 * Kept small to avoid changing application behavior beyond compilation fixes.
 */

export class ValidationError extends Error {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    if (field !== undefined) this.field = field;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class WordLimitExceededError extends Error {
  public readonly sectionType: string;
  public readonly limit: number;
  public readonly actual: number;

  constructor(sectionType: string, limit: number, actual: number) {
    super(`Word limit exceeded for ${sectionType}: limit is ${limit}, got ${actual}`);
    this.name = 'WordLimitExceededError';
    this.sectionType = sectionType;
    this.limit = limit;
    this.actual = actual;
    Error.captureStackTrace(this, this.constructor);
  }
}

