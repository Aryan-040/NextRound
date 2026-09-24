/**
 * Unit tests for validateKit (packages/shared/src/validator.ts)
 *
 * Requirements: 20.6, 20.7
 */

import { describe, it, expect } from 'vitest';
import { validateKit, isValidationError } from '../validator';
import type { Kit } from '../types';

// ---------------------------------------------------------------------------
// Helper: build a complete, valid Kit object
// ---------------------------------------------------------------------------
function buildValidKit(): Kit {
  return {
    source: {
      company: 'Acme Corp',
      company_url: 'https://acme.example.com',
      role: 'Senior Software Engineer',
      location: 'Remote',
      jd_chars: 1200,
      researched_at: '2024-06-01T10:00:00.000Z',
      pages_used: ['https://acme.example.com/careers'],
    },
    company_brief: {
      summary: 'Acme builds cloud-native developer tools.',
      what_they_do: 'They provide a suite of CI/CD and observability products.',
      sources: ['https://acme.example.com/about'],
    },
    role: {
      title: 'Senior Software Engineer',
      seniority: 'Senior',
      responsibilities: ['Design distributed systems', 'Mentor junior engineers'],
      requirements: [
        { id: 'r1', text: 'Strong TypeScript skills', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Experience with React', kind: 'technical', priority: 'nice' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Explain TypeScript generics.',
        answer_outline: 'Cover variance, constraints, utility types.',
        difficulty: 2,
        pinned: false,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'technical',
        prompt: 'How does React reconciliation work?',
        answer_outline: 'Fibre, diffing algorithm, keys.',
        difficulty: 1,
        pinned: false,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is a TypeScript generic?',
        back: 'A placeholder type parameter making code reusable.',
        requirement_ids: ['r1'],
        pinned: false,
      },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: 'Technical', question_ids: ['q1'], minutes: 15 },
        { day: 2, focus: 'Technical', question_ids: ['q2'], minutes: 15 },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Test 1: valid kit object passes without errors
// ---------------------------------------------------------------------------
describe('validateKit – valid kit', () => {
  it('returns the Kit object (not a ValidationError) for a fully valid kit', () => {
    const kit = buildValidKit();
    const result = validateKit(kit);

    expect(isValidationError(result)).toBe(false);
    // The returned value should be the same structure (cast back to Kit)
    expect((result as Kit).source.company).toBe('Acme Corp');
  });
});

// ---------------------------------------------------------------------------
// Test 2: kit missing `questions` array → error identifying "questions"
// ---------------------------------------------------------------------------
describe('validateKit – missing questions array', () => {
  it('returns a ValidationError with a field error for "questions" when the array is absent', () => {
    const kit = buildValidKit() as unknown as Record<string, unknown>;
    delete kit['questions'];

    const result = validateKit(kit);

    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    const fields = result.errors.map((e) => e.field);
    // The error must mention the "questions" field
    expect(fields.some((f) => f === 'questions' || f.startsWith('questions'))).toBe(true);
  });

  it('returns a ValidationError when questions is not an array (set to an object)', () => {
    const kit = buildValidKit() as unknown as Record<string, unknown>;
    kit['questions'] = { not: 'an array' };

    const result = validateKit(kit);

    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    const fields = result.errors.map((e) => e.field);
    expect(fields.some((f) => f === 'questions' || f.startsWith('questions'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 3: kit with difficulty = 4 → error identifying the field
// ---------------------------------------------------------------------------
describe('validateKit – invalid difficulty', () => {
  it('returns a ValidationError identifying the difficulty field when difficulty is 4', () => {
    const kit = buildValidKit();
    // Force an out-of-range difficulty
    (kit.questions[0] as any).difficulty = 4;

    const result = validateKit(kit);

    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    const fields = result.errors.map((e) => e.field);
    // Expect something like "questions[0].difficulty"
    expect(fields.some((f) => f.includes('difficulty'))).toBe(true);
  });

  it('returns a ValidationError when difficulty is 0 (below range)', () => {
    const kit = buildValidKit();
    (kit.questions[0] as any).difficulty = 0;

    const result = validateKit(kit);

    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    const fields = result.errors.map((e) => e.field);
    expect(fields.some((f) => f.includes('difficulty'))).toBe(true);
  });

  it('returns a ValidationError when difficulty is a float (e.g. 1.5)', () => {
    const kit = buildValidKit();
    (kit.questions[0] as any).difficulty = 1.5;

    const result = validateKit(kit);

    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    const fields = result.errors.map((e) => e.field);
    expect(fields.some((f) => f.includes('difficulty'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 4: kit with minutes = 1.5 → error identifying the field
// ---------------------------------------------------------------------------
describe('validateKit – non-integer minutes', () => {
  it('returns a ValidationError identifying the minutes field when minutes is 1.5', () => {
    const kit = buildValidKit();
    (kit.schedule.days[0] as any).minutes = 1.5;

    const result = validateKit(kit);

    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    const fields = result.errors.map((e) => e.field);
    // Expect something like "schedule.days[0].minutes"
    expect(fields.some((f) => f.includes('minutes'))).toBe(true);
  });

  it('returns a ValidationError when minutes is a string instead of an integer', () => {
    const kit = buildValidKit();
    (kit.schedule.days[0] as any).minutes = '15';

    const result = validateKit(kit);

    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    const fields = result.errors.map((e) => e.field);
    expect(fields.some((f) => f.includes('minutes'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 5: schedule.days[n].question_ids references non-existent question ID
// ---------------------------------------------------------------------------
describe('validateKit – schedule references unknown question ID', () => {
  it('returns a ValidationError when a day question_ids entry does not match any question', () => {
    const kit = buildValidKit();
    // Point to a question ID that doesn't exist
    kit.schedule.days[0].question_ids = ['q999'];

    const result = validateKit(kit);

    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    const fields = result.errors.map((e) => e.field);
    // Expect something like "schedule.days[0].question_ids[0]"
    expect(
      fields.some((f) => f.startsWith('schedule.days') && f.includes('question_ids')),
    ).toBe(true);
  });

  it('returns a ValidationError mentioning the unknown ID in the error message', () => {
    const kit = buildValidKit();
    kit.schedule.days[0].question_ids = ['q_nonexistent'];

    const result = validateKit(kit);

    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    const hasMessage = result.errors.some((e) => e.message.includes('q_nonexistent'));
    expect(hasMessage).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------
describe('validateKit – additional field-level errors', () => {
  it('returns a ValidationError when the root value is not an object', () => {
    const result = validateKit(null);
    expect(isValidationError(result)).toBe(true);
  });

  it('returns a ValidationError when source is missing', () => {
    const kit = buildValidKit() as unknown as Record<string, unknown>;
    delete kit['source'];

    const result = validateKit(kit);
    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    const fields = result.errors.map((e) => e.field);
    expect(fields.some((f) => f === 'source' || f.startsWith('source.'))).toBe(true);
  });

  it('accumulates multiple errors rather than stopping at the first', () => {
    const kit = buildValidKit() as unknown as Record<string, unknown>;
    // Introduce two independent errors: wrong difficulty AND missing questions
    const broken = {
      ...(kit as object),
      questions: undefined,
      schedule: {
        ...(kit['schedule'] as object),
        days: [
          { day: 1, focus: 'Technical', question_ids: [], minutes: 7.5 },
        ],
      },
    };

    const result = validateKit(broken);
    expect(isValidationError(result)).toBe(true);
    if (!isValidationError(result)) return;

    // Should have reported both the missing questions array and the non-integer minutes
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
