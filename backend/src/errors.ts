/**
 * errors.ts
 * Custom error classes for the application.
 *
 * HttpError is thrown anywhere in route handlers or middleware to signal a
 * known HTTP failure. The global error handler (errorHandler.ts) detects it
 * via `instanceof` and maps it directly to the correct status code and JSON
 * body, avoiding accidental leakage of internal stack traces.
 */

/**
 * A known HTTP error that should be surfaced to the client.
 *
 * @param status  HTTP status code (e.g. 400, 401, 403, 404, 409).
 * @param message Human-readable error description returned in `{ error }`.
 * @param field   Optional field name returned in `{ field }` for validation
 *                errors so the frontend can highlight the offending input.
 */
export class HttpError extends Error {
  public readonly status: number;
  public readonly field?: string;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.field = field;

    // Maintains proper prototype chain in transpiled ES5 output.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
