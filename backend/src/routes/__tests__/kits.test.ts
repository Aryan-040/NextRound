/**
 * kits.test.ts
 * Unit/integration tests for the kit management routes.
 *
 * Strategy:
 * - Mock config, Mongoose models, and the extraction pipeline so no real DB
 *   or LLM calls are made.
 * - Use supertest to exercise the full Express routing and middleware stack.
 * - Sign real JWTs with the same test secret so the authenticate middleware
 *   passes cleanly without mocking it.
 *
 * Requirements covered:
 *   2.1–2.6  (create kit: validation, dedup, forceCreate)
 *   11.2     (PATCH marks edited items as pinned)
 *   13.3     (ownership — 403 on wrong user)
 *   13.4     (DELETE kit also deletes FlashcardProgress)
 *   14.x     (single-item DELETE for questions/flashcards)
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
    findOne:          vi.fn(),
    findById:         vi.fn(),
    findByIdAndUpdate: vi.fn(),
    updateOne:        vi.fn(),
    find:             vi.fn(),
    create:           vi.fn(),
    deleteOne:        vi.fn(),
  },
}));

// ── Mock FlashcardProgress model ──────────────────────────────────────────────
vi.mock('../../models/FlashcardProgress', () => ({
  default: {
    deleteMany: vi.fn(),
  },
}));

// ── Mock extraction pipeline (no LLM/crawl in unit tests) ────────────────────
vi.mock('../../services/extractionPipeline', () => ({
  runPipeline:                  vi.fn(),
  computeDedupeKey:             vi.fn((_jd: string, url: string) => `key:${url}`),
  generateCompanyBrief:         vi.fn(),
  generateQuestionsForCategory: vi.fn(),
  generateFlashcards:           vi.fn(),
  runCoverageAndGapFill:        vi.fn(),
}));

// ── Mock llmClient (createLLMClient used by regenerate) ──────────────────────
vi.mock('../../services/llmClient', () => ({
  createLLMClient:       vi.fn(),
  completeWithJsonRetry: vi.fn(),
  sleep:                 vi.fn(),
  RATE_LIMIT_BACKOFFS_MS: [],
}));

// ── Mock scheduler ────────────────────────────────────────────────────────────
vi.mock('../../services/scheduler', () => ({
  buildSchedule: vi.fn().mockReturnValue({ days_available: 5, days: [] }),
}));

// ── Mock pipelineEmitter so no real EventEmitter is needed ───────────────────
vi.mock('../../events', () => ({
  pipelineEmitter: {
    emitStage: vi.fn(),
    on:        vi.fn(),
    off:       vi.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import KitModel from '../../models/Kit';
import FlashcardProgressModel from '../../models/FlashcardProgress';

const JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

// ── Typed mock aliases ────────────────────────────────────────────────────────
const mockFindOne          = KitModel.findOne          as ReturnType<typeof vi.fn>;
const mockFindById         = KitModel.findById         as ReturnType<typeof vi.fn>;
const mockFindByIdAndUpdate = KitModel.findByIdAndUpdate as ReturnType<typeof vi.fn>;
const mockUpdateOne        = KitModel.updateOne        as ReturnType<typeof vi.fn>;
const mockFind             = KitModel.find             as ReturnType<typeof vi.fn>;
const mockKitCreate        = KitModel.create           as ReturnType<typeof vi.fn>;
const mockDeleteOne        = KitModel.deleteOne        as ReturnType<typeof vi.fn>;
const mockDeleteMany       = FlashcardProgressModel.deleteMany as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_A_ID = '6ab405f23e5413ef4321aa01';
const USER_B_ID = '6ab405f23e5413ef4321bb02';
const KIT_ID    = '6ab405f23e5413ef4321cc03';

function makeToken(userId: string, email = 'test@example.com'): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

/** Minimal Mongoose document shape returned by findById. */
function makeKitDoc(ownerIdStr = USER_A_ID, overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    _id:     { toString: () => KIT_ID, equals: (id: string | Types.ObjectId) => id.toString() === KIT_ID },
    userId:  { toString: () => ownerIdStr, equals: (id: string | Types.ObjectId) => id.toString() === ownerIdStr },
    status:  'ready',
    source:  { company: 'Acme', company_url: 'https://acme.com', role: 'SWE', location: '', jd_chars: 100, researched_at: '', pages_used: [] },
    company_brief: { summary: 'S', what_they_do: 'W', sources: [] },
    role:    { title: 'SWE', seniority: 'Mid', responsibilities: [], requirements: [
      { id: 'r1', text: 'TypeScript', kind: 'technical', priority: 'must' },
    ]},
    questions:  [
      { id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'Tell me about TS', answer_outline: '', difficulty: 2, pinned: false },
    ],
    flashcards: [
      { id: 'f1', front: 'What is TS?', back: 'TypeScript', requirement_ids: ['r1'], pinned: false },
    ],
    schedule: { days_available: 5, days: [] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
    dedupeKey: 'key:https://acme.com',
    pipelineError: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };

  // Attach a mutable save() that can be spied on
  doc.save = vi.fn().mockResolvedValue(doc);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kits — create kit
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/kits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when jobDescription is too short', async () => {
    const res = await supertest(app)
      .post('/api/kits')
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ jobDescription: 'short', companyUrl: 'https://acme.com', daysAvailable: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/50 characters/i);
  });

  it('returns 400 when companyUrl is not a valid URL', async () => {
    const res = await supertest(app)
      .post('/api/kits')
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ jobDescription: 'A'.repeat(60), companyUrl: 'not-a-url', daysAvailable: 5 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when daysAvailable is out of range', async () => {
    const res = await supertest(app)
      .post('/api/kits')
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ jobDescription: 'A'.repeat(60), companyUrl: 'https://acme.com', daysAvailable: 0 });

    expect(res.status).toBe(400);
  });

  it('returns 409 with existingKit when a duplicate kit exists', async () => {
    const existingDoc = {
      _id: { toString: () => KIT_ID },
      status: 'ready',
      source: { role: 'SWE', company: 'Acme' },
      createdAt: new Date(),
    };
    // findOne returns an object with .select() that resolves to the existing kit
    mockFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(existingDoc),
    });

    const res = await supertest(app)
      .post('/api/kits')
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ jobDescription: 'A'.repeat(60), companyUrl: 'https://acme.com', daysAvailable: 5 });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('existingKit');
    expect(res.body.existingKit.id).toBe(KIT_ID);
  });

  it('skips the dedup check and returns 201 when forceCreate is true', async () => {
    // findOne should NOT be called when forceCreate bypasses the check
    mockFindOne.mockResolvedValue(null);
    const newKitDoc = { _id: { toString: () => 'new-kit-id' } };
    mockKitCreate.mockResolvedValue(newKitDoc);
    mockUpdateOne.mockResolvedValue({});

    const res = await supertest(app)
      .post('/api/kits')
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ jobDescription: 'A'.repeat(60), companyUrl: 'https://acme.com', daysAvailable: 5, forceCreate: true });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('kitId');
    // dedup findOne should NOT have been called
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('returns 401 without a valid token', async () => {
    const res = await supertest(app)
      .post('/api/kits')
      .send({ jobDescription: 'A'.repeat(60), companyUrl: 'https://acme.com', daysAvailable: 5 });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kits/:id — ownership check
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/kits/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with the kit document for the owner', async () => {
    mockFindById.mockResolvedValue(makeKitDoc(USER_A_ID));

    const res = await supertest(app)
      .get(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ready');
  });

  it('returns 403 when a different user requests the kit', async () => {
    mockFindById.mockResolvedValue(makeKitDoc(USER_A_ID));

    const res = await supertest(app)
      .get(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_B_ID)}`); // wrong user

    expect(res.status).toBe(403);
  });

  it('returns 404 when the kit does not exist', async () => {
    mockFindById.mockResolvedValue(null);

    const res = await supertest(app)
      .get(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/kits/:id — pinning behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/kits/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks an edited question as pinned', async () => {
    const kitDoc = makeKitDoc(USER_A_ID);
    mockFindById.mockResolvedValue(kitDoc);

    const res = await supertest(app)
      .patch(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ questions: [{ id: 'q1', prompt: 'Updated prompt' }] });

    expect(res.status).toBe(200);
    // The question should now be pinned
    const updatedQ = (kitDoc.questions as Array<{ id: string; pinned: boolean; prompt: string }>)
      .find(q => q.id === 'q1');
    expect(updatedQ?.pinned).toBe(true);
    expect(updatedQ?.prompt).toBe('Updated prompt');
  });

  it('marks an edited flashcard as pinned', async () => {
    const kitDoc = makeKitDoc(USER_A_ID);
    mockFindById.mockResolvedValue(kitDoc);

    const res = await supertest(app)
      .patch(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ flashcards: [{ id: 'f1', front: 'Updated front' }] });

    expect(res.status).toBe(200);
    const updatedF = (kitDoc.flashcards as Array<{ id: string; pinned: boolean; front: string }>)
      .find(f => f.id === 'f1');
    expect(updatedF?.pinned).toBe(true);
    expect(updatedF?.front).toBe('Updated front');
  });

  it('inserts a new question with pinned=true when id is not found', async () => {
    const kitDoc = makeKitDoc(USER_A_ID);
    mockFindById.mockResolvedValue(kitDoc);

    const res = await supertest(app)
      .patch(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ questions: [{ id: 'q99', prompt: 'New question', difficulty: 1, category: 'technical', requirement_ids: ['r1'], answer_outline: '' }] });

    expect(res.status).toBe(200);
    const newQ = (kitDoc.questions as Array<{ id: string; pinned: boolean }>)
      .find(q => q.id === 'q99');
    expect(newQ?.pinned).toBe(true);
  });

  it('returns 403 when a different user tries to patch', async () => {
    mockFindById.mockResolvedValue(makeKitDoc(USER_A_ID));

    const res = await supertest(app)
      .patch(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_B_ID)}`)
      .send({ questions: [{ id: 'q1', prompt: 'Hack' }] });

    expect(res.status).toBe(403);
  });

  it('returns 400 on an invalid PATCH body (unknown field via strict)', async () => {
    mockFindById.mockResolvedValue(makeKitDoc(USER_A_ID));

    const res = await supertest(app)
      .patch(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ unknownField: 'bad' });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/kits/:id — kit deletion
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/kits/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 and deletes kit + FlashcardProgress for the owner', async () => {
    mockFindById.mockResolvedValue(makeKitDoc(USER_A_ID));
    mockDeleteOne.mockResolvedValue({});
    mockDeleteMany.mockResolvedValue({});

    const res = await supertest(app)
      .delete(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(204);
    expect(mockDeleteOne).toHaveBeenCalledOnce();
    expect(mockDeleteMany).toHaveBeenCalledOnce();
  });

  it('returns 403 when a different user attempts deletion', async () => {
    mockFindById.mockResolvedValue(makeKitDoc(USER_A_ID));

    const res = await supertest(app)
      .delete(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_B_ID)}`);

    expect(res.status).toBe(403);
    expect(mockDeleteOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the kit does not exist', async () => {
    mockFindById.mockResolvedValue(null);

    const res = await supertest(app)
      .delete(`/api/kits/${KIT_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/kits/:id/flashcards/:flashcardId
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/kits/:id/flashcards/:flashcardId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the flashcard and returns 204', async () => {
    const kitDoc = makeKitDoc(USER_A_ID);
    mockFindById.mockResolvedValue(kitDoc);

    const res = await supertest(app)
      .delete(`/api/kits/${KIT_ID}/flashcards/f1`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(204);
    expect(
      (kitDoc.flashcards as Array<{ id: string }>).find(f => f.id === 'f1')
    ).toBeUndefined();
    expect(kitDoc.save).toHaveBeenCalled();
  });

  it('returns 404 when the flashcard id does not exist', async () => {
    mockFindById.mockResolvedValue(makeKitDoc(USER_A_ID));

    const res = await supertest(app)
      .delete(`/api/kits/${KIT_ID}/flashcards/f999`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-owner', async () => {
    mockFindById.mockResolvedValue(makeKitDoc(USER_A_ID));

    const res = await supertest(app)
      .delete(`/api/kits/${KIT_ID}/flashcards/f1`)
      .set('Authorization', `Bearer ${makeToken(USER_B_ID)}`);

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/kits/:id/questions/:questionId
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/kits/:id/questions/:questionId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the question and returns 204', async () => {
    const kitDoc = makeKitDoc(USER_A_ID);
    mockFindById.mockResolvedValue(kitDoc);

    const res = await supertest(app)
      .delete(`/api/kits/${KIT_ID}/questions/q1`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(204);
    expect(
      (kitDoc.questions as Array<{ id: string }>).find(q => q.id === 'q1')
    ).toBeUndefined();
  });

  it('returns 404 when the question id does not exist', async () => {
    mockFindById.mockResolvedValue(makeKitDoc(USER_A_ID));

    const res = await supertest(app)
      .delete(`/api/kits/${KIT_ID}/questions/q999`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.status).toBe(404);
  });
});
