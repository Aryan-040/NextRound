/**
 * auth.ts
 * Express router for authentication endpoints.
 *
 * POST /api/auth/register — creates a new user account and returns a JWT.
 * POST /api/auth/login    — verifies credentials and returns a JWT.
 *
 * Design decisions:
 * - Zod validates request bodies before any DB or bcrypt work is done.
 * - bcrypt cost factor 12 matches the User model spec (Requirement 1.8).
 * - Login returns a single generic message for both bad-email and bad-password
 *   to prevent user-enumeration attacks (Requirement 1.3).
 * - The duplicate-email path uses the Mongoose error code 11000 so we only
 *   run one DB write per registration (no pre-check SELECT).
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import User from '../models/User';
import { HttpError } from '../errors';
import { config } from '../config';

const router = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters' })
    .max(128, { message: 'Password must be at most 128 characters' }),
});

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

// ── POST /register ────────────────────────────────────────────────────────────

router.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 1. Validate request body
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // Map Zod path back to a field name for the error response
      const field = issue.path[0] as string | undefined;
      return next(new HttpError(400, issue.message, field));
    }

    const { email, password } = parsed.data;

    // 2. Hash password with bcrypt cost 12
    const passwordHash = await bcrypt.hash(password, 12);

    // 3. Persist user — let MongoDB enforce the unique index
    let user;
    try {
      user = await User.create({ email, passwordHash });
    } catch (err: unknown) {
      // MongoDB duplicate key error
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 11000
      ) {
        return next(new HttpError(400, 'Email is already registered', 'email'));
      }
      return next(err);
    }

    // 4. Issue JWT
    // `expiresIn` is typed as StringValue (branded) in newer @types/jsonwebtoken;
    // we cast through unknown to satisfy the overload without losing runtime behaviour.
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      config.jwtSecret,
      { algorithm: 'HS256', expiresIn: config.jwtExpiry as unknown as number },
    );

    res.status(201).json({
      token,
      user: { id: user._id.toString(), email: user.email },
    });
  },
);

// ── POST /login ───────────────────────────────────────────────────────────────

router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 1. Basic format validation (wrong format → still 401 to avoid leaking info)
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(401, 'Invalid credentials'));
    }

    const { email, password } = parsed.data;

    // 2. Look up user — email stored lowercase so direct match works
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return next(new HttpError(401, 'Invalid credentials'));
    }

    // 3. Compare plaintext password against stored bcrypt hash
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return next(new HttpError(401, 'Invalid credentials'));
    }

    // 4. Issue JWT with 24h expiry (from config)
    // `expiresIn` is typed as StringValue (branded) in newer @types/jsonwebtoken;
    // we cast through unknown to satisfy the overload without losing runtime behaviour.
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      config.jwtSecret,
      { algorithm: 'HS256', expiresIn: config.jwtExpiry as unknown as number },
    );

    res.json({
      token,
      user: { id: user._id.toString(), email: user.email },
    });
  },
);

export default router;
