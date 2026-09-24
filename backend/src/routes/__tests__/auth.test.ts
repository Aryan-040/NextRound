/**
 * auth.test.ts
 * Unit tests for the auth routes (POST /register, POST /login) and the
 * `authenticate` JWT middleware.
 *
 * Strategy
 * ─────────
 * • `config.ts` validates env vars at module-evaluation time and calls
 *   `process.exit` on missing values.  We mock `../../config` before any
 *   module that transitively imports it (app.ts → config.ts) is loaded, so
 *   the real startup validation never runs.
 * • `../models/User` is mocked with vi.mock so no MongoDB connection is needed.
 * • `bcryptjs` is mocked so tests run without real hashing overhead.
 * • Route behaviour is asserted via `supertest` against the full Express app.
 * • Middleware behaviour is asserted with lightweight mock req/res/next objects.
 *
 * Requirements covered: 1.1–1.8
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock config FIRST — before any module that imports it is loaded ───────────
// This prevents config.ts from calling process.exit during test collection.
vi.mock('../../config', () => ({
  config: {
    mongoUri:         'mongodb://localhost:27017/test',
    jwtSecret:        'test-secret-that-is-at-least-32-characters-long',
    jwtExpiry:        '1h',
    llmProvider:      'gemini' as const,
    geminiApiKey:     'test-gemini-key',
    geminiModel:      'gemini-1.5-flash',
    groqApiKey:       undefined,
    groqModel:        'llama-3.1-70b-versatile',
    researchProvider: 'duckduckgo' as const,
    serpApiKey:       undefined,
    port:             4000,
    isProduction:     false,
    frontendUrl:      'http://localhost:3000',
  },
}));

// ── Mock the User Mongoose model ──────────────────────────────────────────────
vi.mock('../../models/User', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

// ── Mock bcryptjs to skip real hashing in unit tests ─────────────────────────
vi.mock('bcryptjs', () => ({
  default: {
    hash:    vi.fn().mockResolvedValue('$hashed$'),
    compare: vi.fn(),
  },
}));

// ── Imports (safe now — config.ts will use the mock above) ───────────────────
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../../app';
import User from '../../models/User';
import { authenticate } from '../../middleware/authenticate';
import type { Request, Response, NextFunction } from 'express';

// Typed aliases for the mocks so TypeScript knows they are vi.fn()
const mockFindOne = User.findOne as ReturnType<typeof vi.fn>;
const mockCreate  = User.create  as ReturnType<typeof vi.fn>;
const mockCompare = bcrypt.compare as ReturnType<typeof vi.fn>;

// The JWT secret must match config.jwtSecret used by the route and middleware.
const JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal fake user document returned by User.findOne/create. */
function makeUser(overrides: Partial<{ _id: string; email: string; passwordHash: string }> = {}) {
  return {
    _id: { toString: () => overrides._id ?? 'user-id-123' },
    email: overrides.email ?? 'alice@example.com',
    passwordHash: overrides.passwordHash ?? '$hashed$',
  };
}

/** Sign a token with the test secret — mirrors what the route does. */
function signToken(payload: object, options: jwt.SignOptions = {}): string {
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', ...options });
}

// ─────────────────────────────────────────────────────────────────────────────
// authenticate middleware — isolated unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('authenticate middleware', () => {
  /**
   * Build a mock req/res/next triple.  The res mock chains .status() → res
   * (same object) so that `res.status(401).json(...)` works without errors.
   */
  function makeReqRes(authHeader?: string) {
    const req = {
      headers: authHeader ? { authorization: authHeader } : {},
      query: {},  // required because authenticate checks req.query['token']
    } as unknown as Request;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = {};
    res.json   = vi.fn().mockReturnValue(res);
    res.status = vi.fn().mockReturnValue(res);

    const next = vi.fn() as unknown as NextFunction;
    return { req, res: res as Response, next };
  }

  it('calls next() and sets req.user when a valid JWT is provided', () => {
    const payload = { userId: 'u1', email: 'test@example.com' };
    const token   = signToken(payload);
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((req as any).user).toMatchObject(payload);
  });

  it('returns 401 when the Authorization header is absent', () => {
    const { req, res, next } = makeReqRes(); // no header at all

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).status).toHaveBeenCalledWith(401);
  });

  it('returns 401 and does NOT call next when the token is expired', () => {
    // expiresIn: -1 creates a token whose exp is already in the past
    const token = signToken({ userId: 'u1', email: 'test@example.com' }, { expiresIn: -1 });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when the token is malformed', () => {
    const { req, res, next } = makeReqRes('Bearer this.is.not.valid');

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when the header does not start with "Bearer "', () => {
    const token = signToken({ userId: 'u1', email: 'test@example.com' });
    const { req, res, next } = makeReqRes(`Token ${token}`); // wrong scheme

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).status).toHaveBeenCalledWith(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 with a generic message when the email does not exist', async () => {
    mockFindOne.mockResolvedValue(null); // user not found

    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'SomePassword1' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
  });

  it('returns 401 with a generic message when the password is wrong', async () => {
    mockFindOne.mockResolvedValue(makeUser()); // user found
    mockCompare.mockResolvedValue(false);       // password does not match

    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
  });

  it('error messages for bad-email vs bad-password are identical (no user enumeration)', async () => {
    // Path A — email not found
    mockFindOne.mockResolvedValue(null);
    const badEmailRes = await supertest(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'AnyPassword1' });

    // Path B — wrong password
    mockFindOne.mockResolvedValue(makeUser());
    mockCompare.mockResolvedValue(false);
    const badPasswordRes = await supertest(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'WrongPassword!' });

    // The messages must be byte-for-byte identical so neither reveals which check failed
    expect(badEmailRes.body.error).toBe(badPasswordRes.body.error);
    // Neither response should include a `field` that hints at which case failed
    expect(badEmailRes.body).not.toHaveProperty('field');
    expect(badPasswordRes.body).not.toHaveProperty('field');
  });

  it('returns 200 with a token and user object when credentials are valid', async () => {
    mockFindOne.mockResolvedValue(makeUser());
    mockCompare.mockResolvedValue(true);

    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'CorrectPassword1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toMatchObject({ email: 'alice@example.com' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 with field "password" when password is shorter than 8 characters', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'short' }); // 5 chars

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('field', 'password');
    // Validation must happen before User.create is ever called
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 with field "password" when password exceeds 128 characters', async () => {
    const longPassword = 'a'.repeat(129);

    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: longPassword });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('field', 'password');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 with field "email" when the email format is invalid', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'ValidPass123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('field', 'email');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 with field "email" when the email is already registered', async () => {
    // MongoDB duplicate key error (code 11000) thrown by User.create
    const duplicateError = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    mockCreate.mockRejectedValue(duplicateError);

    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'ValidPass123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('field', 'email');
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('returns 201 with a token and user object on successful registration', async () => {
    const newUser = makeUser({ _id: 'new-user-id', email: 'charlie@example.com' });
    mockCreate.mockResolvedValue(newUser);

    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ email: 'charlie@example.com', password: 'ValidPass123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({ email: 'charlie@example.com' });
  });
});
