/**
 * authenticate.ts
 * Express middleware that verifies a Bearer JWT on every protected route.
 *
 * On success:  attaches `req.user = { userId, email }` and calls `next()`.
 * On failure:  returns a 401 JSON response and stops the middleware chain.
 *
 * The middleware enforces HS256 explicitly so that an attacker cannot supply
 * a token signed with the "none" algorithm or an asymmetric key and have it
 * accepted (Requirements 1.4, 1.5).
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

/** Shape of the JWT payload issued at login / registration. */
interface JwtPayload {
  userId: string;
  email: string;
}

/**
 * Verifies the `Authorization: Bearer <token>` header using HS256 and
 * `config.jwtSecret`. Attaches the decoded payload to `req.user` on success.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Primary: Authorization: Bearer <token> header
  // Fallback: ?token=<token> query param — used by EventSource (SSE) which
  // cannot set custom headers in the browser.
  const header = req.headers.authorization;
  let token: string | undefined;

  if (header?.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (typeof req.query['token'] === 'string' && req.query['token']) {
    token = req.query['token'];
  } else {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // `algorithms` is explicitly restricted to HS256 to prevent algorithm
    // confusion attacks (e.g. switching to "none" or an RS256 public key).
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    }) as JwtPayload;

    req.user = { userId: payload.userId, email: payload.email };
    next();
  } catch {
    // jwt.verify throws for expired, malformed, or tampered tokens.
    // A single generic message avoids leaking which specific check failed.
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

