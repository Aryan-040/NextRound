/**
 * errorHandler.ts
 * Global Express error-handling middleware.
 *
 * Must be registered LAST in the Express middleware chain (after all routes)
 * so it catches errors forwarded via `next(err)` from anywhere in the app.
 *
 * Behaviour:
 *  - HttpError instances → HTTP status from the error + { error, field? } body
 *  - Any other error     → 500 + { error: "Internal server error" } (no leak)
 *
 * Stack traces are never sent to the client to avoid information disclosure.
 */

import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../errors';

// Express identifies error-handling middleware by its four-parameter signature.
// The leading underscore on unused params silences the no-unused-vars rule.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    const body: { error: string; field?: string } = { error: err.message };
    if (err.field !== undefined) {
      body.field = err.field;
    }
    res.status(err.status).json(body);
    return;
  }

  // Log the real error server-side for observability, but never forward
  // internal details (stack traces, DB messages) to the caller.
  if (err instanceof Error) {
    console.error('[errorHandler] Unhandled error:', err.message, err.stack);
  } else {
    console.error('[errorHandler] Unhandled non-Error thrown:', err);
  }

  res.status(500).json({ error: 'Internal server error' });
}
