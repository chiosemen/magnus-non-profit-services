/**
 * Magnus MCP Connector — InputValidator
 * Centralized Zod schema registry and validation for all tool inputs
 */

import { z, ZodTypeAny, ZodError } from 'zod';
import { ValidationError, RequiredFieldError, InvalidFormatError } from '../utils/errors';

// ─── Shared Schemas ────────────────────────────────────────────────────────────

export const EINSchema = z
  .string()
  .min(9, 'EIN must be at least 9 characters')
  .transform(v => v.replace(/\D/g, ''))
  .refine(v => v.length === 9, { message: 'EIN must be exactly 9 digits' });

export const TaxYearSchema = z
  .number()
  .int()
  .min(2000, 'Tax year must be 2000 or later')
  .max(new Date().getFullYear(), 'Tax year cannot be in the future');

export const StateCodeSchema = z
  .string()
  .length(2, 'State code must be exactly 2 characters')
  .toUpperCase();

export const NTEECodeSchema = z
  .string()
  .regex(/^[A-Z]\d{2}$/, 'NTEE code format: letter + 2 digits (e.g. E20, B12)');

export const UserIdSchema = z.string().uuid('userId must be a valid UUID');

export const PlaidTokenSchema = z
  .string()
  .startsWith('access-', 'Plaid access token must start with "access-"');

// ─── Schema Registry ──────────────────────────────────────────────────────────

const schemaRegistry = new Map<string, ZodTypeAny>();

export function registerSchema(toolName: string, schema: ZodTypeAny): void {
  schemaRegistry.set(toolName, schema);
}

export function getSchema(toolName: string): ZodTypeAny | undefined {
  return schemaRegistry.get(toolName);
}

// ─── Validator Class ──────────────────────────────────────────────────────────

export class InputValidator {
  /**
   * Validate tool input against registered schema
   * Throws ValidationError on failure
   */
  static validateTool<T>(toolName: string, input: unknown): T {
    const schema = schemaRegistry.get(toolName);
    if (!schema) {
      // No schema registered — pass through (tool handles its own validation)
      return input as T;
    }
    return this.validate<T>(schema, input, toolName);
  }

  /**
   * Validate against an explicit schema
   */
  static validate<T>(schema: ZodTypeAny, input: unknown, context?: string): T {
    const result = schema.safeParse(input);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const field = firstIssue?.path.join('.') ?? 'input';
      const message = firstIssue?.message ?? 'Validation failed';
      throw new ValidationError(
        context ? `[${context}] ${message}` : message,
        field,
        input
      );
    }
    return result.data as T;
  }

  /**
   * Validate EIN format
   */
  static validateEIN(ein: string): string {
    return this.validate<string>(EINSchema, ein, 'EIN');
  }

  /**
   * Validate tax year
   */
  static validateTaxYear(year: number): number {
    return this.validate<number>(TaxYearSchema, year, 'TaxYear');
  }

  /**
   * Assert a required field is present and non-empty
   */
  static assertRequired(value: unknown, fieldName: string): void {
    if (value === null || value === undefined || value === '') {
      throw new RequiredFieldError(fieldName);
    }
  }

  /**
   * Bulk validate multiple required fields
   */
  static assertRequiredFields(obj: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
      this.assertRequired(obj[field], field);
    }
  }

  /**
   * Convert ZodError to ValidationError
   */
  static fromZodError(err: ZodError, context?: string): ValidationError {
    const firstIssue = err.issues[0];
    const field = firstIssue?.path.join('.') ?? 'input';
    const message = firstIssue?.message ?? 'Validation failed';
    return new ValidationError(
      context ? `[${context}] ${message}` : message,
      field
    );
  }
}

// ─── Auto-register all tool schemas on import ─────────────────────────────────

export function autoRegisterToolSchemas(): void {
  // Tool schemas are registered when their modules are imported
  // This function exists to trigger bulk import if needed
  const toolNames = [
    'get-990-data', 'get-filing-history', 'get-state-registrations', 'check-compliance-status',
    'find-opportunities', 'check-eligibility', 'get-grant-history', 'get-funder-research',
    'get-financial-ratios', 'get-revenue-breakdown', 'get-expense-allocation',
    'get-income-summary', 'get-tax-estimates', 'get-multi-org-profile',
  ];
  // Schemas are registered via registerSchema() in each tool's module
}

export default InputValidator;
