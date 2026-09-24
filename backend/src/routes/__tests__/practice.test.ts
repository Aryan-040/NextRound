/**
 * practice.test.ts
 * Unit tests for the practice mode routes.
 *
 * GET  /api/kits/:id/practice/deck  — deck ordering algorithm
 * POST /api/kits/:id/practice/rate  — confidence recording + mean recomputation
 *
 * Requirements covered: 15.3, 15.4, 15.6
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Types } from 'mongoose';

// ── Mock config ───────────────────────────────────────────────────────────────
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

// ── Mock Kit model ────────────────────────────────────────────────────────────
vi.mock('../../models/Kit', () => ({
  default: {
    findById: vi.fn(),
  },
}));

// ── Mock FlashcardProgress model ──────────────────────────────────────────────
vi.mock('../../models/FlashcardProgress', () => ({
  default: {
    find:             vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import KitModel from '../../models/Kit';
import FlashcardProgressModel from '../../models/FlashcardProgress';

const JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

const USER_A_ID = '6ab405f23e5413ef4321aa01';
const USER_B_ID = '6ab405f23e5413ef4321bb02';
const KIT_ID    = '6ab405f23e5413ef4321cc03';

const mockFindById          = KitModel.findById as ReturnType<typeof vi.fn>;
const mockProgressFind      = FlashcardProgressModel.find as ReturnType<typeof vi.fn>;
const mockProgressFindOneUpd = FlashcardProgressModel.findOneAndUpdate as ReturnType<typeof vi.fn>;

function makeToken(userId: string): string {
  return jwt.sign({ userId, email: 'test@example.com' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

/** Minimal kit document with three flashcards. */
function makeKitWithFlashcards(ownerIdStr = USER_A_ID) {
  return {
    _id:    { toString: () => KIT_ID },
    userId: { equals: (id: string | Types.ObjectId) => id.toString() === ownerIdStr },
    flashcards: [
      { id: 'f1' },
      { id: 'f2' },
      { id: 'f3' },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kits/:id/practice/deck
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/kits/:id/practice/deck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns deck with all flashcard IDs when no prior ratings exist', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue(makeKitWithFlashcards()),
    });
    mockProgressFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });

    const res = await supertest(app)
      .get(`/api/kits/${KIT_ID}/practice/deck`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.deck).toHaveLength(3);
    expect(res.body.deck).toEqual(expect.arrayContaining(['f1', 'f2', 'f3']));
  });

  it('sorts deck by ascending meanConfidence (least-confident first)', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue(makeKitWithFlashcards()),
    });
    // f2 has the lowest confidence, f3 has the highest
    mockProgressFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { flashcardId: 'f1', meanConfidence: 3 },
          { flashcardId: 'f2', meanConfidence: 1 },
          { flashcardId: 'f3', meanConfidence: 4 },
        ]),
      }),
    });

    const res = await supertest(app)
      .get(`/api/kits/${KIT_ID}/practice/deck`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(200);
    // f2 (confidence 1) must come before f1 (3) before f3 (4)
    expect(res.body.deck).toEqual(['f2', 'f1', 'f3']);
  });

  it('places unseen cards (no progress doc) before cards with any confidence', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue(makeKitWithFlashcards()),
    });
    // f1 has been seen; f2 and f3 have not
    mockProgressFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { flashcardId: 'f1', meanConfidence: 2 },
        ]),
      }),
    });

    const res = await supertest(app)
      .get(`/api/kits/${KIT_ID}/practice/deck`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(200);
    // f2 and f3 have meanConfidence 0 (default) so come before f1 (2)
    const deck: string[] = res.body.deck;
    expect(deck.indexOf('f1')).toBeGreaterThan(deck.indexOf('f2'));
    expect(deck.indexOf('f1')).toBeGreaterThan(deck.indexOf('f3'));
  });

  it('returns { deck: [], coveredIds: [] } when the kit has no flashcards', async () => {
    const emptyKit = { ...makeKitWithFlashcards(), flashcards: [] };
    mockFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue(emptyKit),
    });

    const res = await supertest(app)
      .get(`/api/kits/${KIT_ID}/practice/deck`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.deck).toEqual([]);
  });

  it('returns coveredIds for cards with meanConfidence > 0', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue(makeKitWithFlashcards()),
    });
    mockProgressFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { flashcardId: 'f1', meanConfidence: 3 },   // covered
          { flashcardId: 'f2', meanConfidence: 0 },   // NOT covered (meanConfidence = 0)
        ]),
      }),
    });

    const res = await supertest(app)
      .get(`/api/kits/${KIT_ID}/practice/deck`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.coveredIds).toContain('f1');
    expect(res.body.coveredIds).not.toContain('f2');
    expect(res.body.coveredIds).not.toContain('f3');
  });

  it('returns 403 for a non-owner', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue(makeKitWithFlashcards(USER_A_ID)),
    });

    const res = await supertest(app)
      .get(`/api/kits/${KIT_ID}/practice/deck`)
      .set('Authorization', `Bearer ${makeToken(USER_B_ID)}`);

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kits/:id/practice/rate
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/kits/:id/practice/rate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeProgressDoc(confidences: number[]) {
    const ratings = confidences.map(c => ({ confidence: c, ratedAt: new Date() }));
    const doc = {
      ratings,
      meanConfidence: 0,
      save: vi.fn().mockResolvedValue(undefined),
    };
    return doc;
  }

  it('returns 200 and { ok: true } on a valid confidence rating', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue(makeKitWithFlashcards()),
    });
    const progressDoc = makeProgressDoc([3]);
    mockProgressFindOneUpd.mockResolvedValue(progressDoc);

    const res = await supertest(app)
      .post(`/api/kits/${KIT_ID}/practice/rate`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ flashcardId: 'f1', confidence: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('correctly recomputes meanConfidence as the arithmetic mean of all ratings', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue(makeKitWithFlashcards()),
    });
    // Simulate existing ratings [2, 4] plus newly pushed [4] = [2, 4, 4]
    const progressDoc = makeProgressDoc([2, 4, 4]);
    mockProgressFindOneUpd.mockResolvedValue(progressDoc);

    await supertest(app)
      .post(`/api/kits/${KIT_ID}/practice/rate`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ flashcardId: 'f1', confidence: 4 });

    // mean of [2, 4, 4] = 10/3 ≈ 3.333
    expect(progressDoc.meanConfidence).toBeCloseTo(10 / 3);
    expect(progressDoc.save).toHaveBeenCalled();
  });

  it('returns 400 when confidence is outside the 1–4 range', async () => {
    const res = await supertest(app)
      .post(`/api/kits/${KIT_ID}/practice/rate`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ flashcardId: 'f1', confidence: 5 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when flashcardId is missing', async () => {
    const res = await supertest(app)
      .post(`/api/kits/${KIT_ID}/practice/rate`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ confidence: 3 });

    expect(res.status).toBe(400);
  });

  it('returns 404 when the flashcard does not exist in the kit', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue(makeKitWithFlashcards()),
    });

    const res = await supertest(app)
      .post(`/api/kits/${KIT_ID}/practice/rate`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ flashcardId: 'f999', confidence: 2 });

    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-owner', async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue(makeKitWithFlashcards(USER_A_ID)),
    });

    const res = await supertest(app)
      .post(`/api/kits/${KIT_ID}/practice/rate`)
      .set('Authorization', `Bearer ${makeToken(USER_B_ID)}`)
      .send({ flashcardId: 'f1', confidence: 3 });

    expect(res.status).toBe(403);
  });
});
