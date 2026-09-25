/**
 * Minimal validator exports for frontend type compatibility.
 * Frontend doesn't actually use validation at runtime - these are
 * type-only exports for compatibility.
 */

export interface FieldError {
  field: string;
  message: string;
}

export interface ValidationError {
  type: 'ValidationError';
  errors: FieldError[];
}

// Frontend doesn't need actual validation logic - just types
export function validateKit(obj: unknown): any {
  throw new Error('validateKit should not be called in frontend');
}

export function isValidationError(result: any): result is ValidationError {
  return (result as ValidationError).type === 'ValidationError';
}
