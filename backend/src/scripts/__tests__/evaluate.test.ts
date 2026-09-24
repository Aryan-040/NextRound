/**
 * evaluate.test.ts
 *
 * Integration tests for the CLI batch runner (evaluate.ts / main()).
 *
 * Strategy
 * ─────────
 * • `config.ts` calls process.exit at module-evaluation time if env vars are
 *   absent. It is mocked FIRST (before any other import) to prevent that.
 * • `extractionPipeline` is mocked to return a pre-canned valid Kit object,
 *   so no LLM, crawler, or network calls are made.
 * • The test writes a two-case JSON input file to os.tmpdir(), calls the
 *   exported `main()` function directly (no shell spawn), then reads the
 *   output file and asserts shape and content.
 *
 * Requirements: 4.1–4.12
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ── 1. Mock config FIRST ──────────────────────────────────────────────────────
// Must appear before any module that transitively imports config.ts is loaded.
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

// ── 2. Build a minimal valid Kit (Appendix A shape) ───────────────────────────

import type { Kit } from '@interview-prep/shared';

const CANNED_KIT: Kit = {
  source: {
    company: 'Example Corp',
    company_url: 'https://example.com',
    role: 'Software Engineer',
    location: 'Remote',
    jd_chars: 70,
    researched_at: '2024-01-01T00:00:00.000Z',
    pages_used: ['https://example.com'],
  },
  company_brief: {
    summary: 'Example Corp builds developer tools.',
    what_they_do: 'They make great software.',
    sources: ['https://example.com'],
  },
  role: {
    title: 'Software Engineer',
    seniority: 'Mid-level',
    responsibilities: ['Write code', 'Review PRs'],
    requirements: [
      { id: 'r1', text: 'TypeScript is required', kind: 'technical', priority: 'must' },
    ],
  },
  questions: [
    {
      id: 'q1',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'Explain TypeScript generics.',
      answer_outline: 'Cover type parameters, constraints, and common use cases.',
      difficulty: 2,
      pinned: false,
    },
  ],
  flashcards: [
    {
      id: 'f1',
      front: 'What is a TypeScript generic?',
      back: 'A way to write reusable, type-safe code.',
      requirement_ids: ['r1'],
      pinned: false,
    },
  ],
  schedule: {
    days_available: 7,
    days: Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      focus: 'Technical',
      question_ids: i === 0 ? ['q1'] : [],
      minutes: i === 0 ? 15 : 0,
    })),
  },
  coverage: {
    uncovered_requirement_ids: [],
    passes: 1,
  },
};

// ── 3. Mock the extraction pipeline ──────────────────────────────────────────
vi.mock('../../services/extractionPipeline', () => ({
  runPipeline: vi.fn().mockResolvedValue(CANNED_KIT),
}));

// ── 4. Import main() AFTER mocks are set up ───────────────────────────────────
// Dynamic import is used so that Vitest's module mock registry is fully
// applied before evaluate.ts (and its transitive imports) are loaded.
let main: () => Promise<void>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Write JSON to a temp file; return the path. */
function writeTempJson(name: string, content: unknown): string {
  const p = path.join(os.tmpdir(), `evaluate-test-${name}-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify(content), 'utf8');
  return p;
}

/** Remove a file if it exists (cleanup). */
function removeSilent(p: string): void {
  try { fs.unlinkSync(p); } catch { /* ignore */ }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluate CLI batch runner — main()', () => {
  // Captured process.argv and process.exit references
  let originalArgv: string[];
  let originalExit: typeof process.exit;
  const exitMock = vi.fn();

  beforeEach(async () => {
    // Load the module fresh for each test so argv overrides take effect.
    vi.resetModules();

    // Re-apply mocks after resetModules
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

    vi.mock('../../services/extractionPipeline', () => ({
      runPipeline: vi.fn().mockResolvedValue(CANNED_KIT),
    }));

    originalArgv = process.argv;
    originalExit = process.exit;
    process.exit = exitMock as unknown as typeof process.exit;

    const mod = await import('../evaluate');
    main = mod.main;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    exitMock.mockClear();
  });

  // ── Test 1: Output file shape ──────────────────────────────────────────────

  describe('output file shape', () => {
    it('writes { version, generated_at, kits } at the top level', async () => {
      const cases = [
        {
          id: 'case-1',
          jd: 'A comprehensive job description that meets the 50 character minimum',
          company_url: 'https://example.com',
          days: 7,
        },
      ];
      const inputPath  = writeTempJson('shape-input', cases);
      const outputPath = path.join(os.tmpdir(), `evaluate-test-shape-output-${Date.now()}.json`);

      try {
        process.argv = ['node', 'evaluate.ts', '--input', inputPath, '--output', outputPath];
        await main();

        const raw = fs.readFileSync(outputPath, 'utf8');
        const output = JSON.parse(raw);

        expect(output).toHaveProperty('version', '1.0');
        expect(output).toHaveProperty('generated_at');
        expect(typeof output.generated_at).toBe('string');
        // generated_at must be a valid ISO 8601 timestamp
        expect(new Date(output.generated_at).toISOString()).toBe(output.generated_at);
        expect(output).toHaveProperty('kits');
        expect(Array.isArray(output.kits)).toBe(true);
      } finally {
        removeSilent(inputPath);
        removeSilent(outputPath);
      }
    });
  });

  // ── Test 2: Valid case → status 'ok' with full kit ─────────────────────────

  describe('valid case', () => {
    it('produces status "ok" with a Kit object conforming to Appendix A schema', async () => {
      const cases = [
        {
          id: 'case-1',
          jd: 'A comprehensive job description that meets the 50 character minimum',
          company_url: 'https://example.com',
          days: 7,
        },
      ];
      const inputPath  = writeTempJson('valid-input', cases);
      const outputPath = path.join(os.tmpdir(), `evaluate-test-valid-output-${Date.now()}.json`);

      try {
        process.argv = ['node', 'evaluate.ts', '--input', inputPath, '--output', outputPath];
        await main();

        const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        expect(output.kits).toHaveLength(1);

        const entry = output.kits[0];
        // Core result fields
        expect(entry.id).toBe('case-1');
        expect(entry.status).toBe('ok');
        expect(entry.error).toBeNull();

        // Kit must be present and non-null
        const kit = entry.kit as Kit;
        expect(kit).not.toBeNull();
        expect(typeof kit).toBe('object');

        // ── Appendix A schema checks ──────────────────────────────────────────
        // source
        expect(kit.source).toBeDefined();
        expect(typeof kit.source.company).toBe('string');
        expect(typeof kit.source.company_url).toBe('string');
        expect(typeof kit.source.role).toBe('string');
        expect(typeof kit.source.location).toBe('string');
        expect(typeof kit.source.jd_chars).toBe('number');
        expect(typeof kit.source.researched_at).toBe('string');
        expect(Array.isArray(kit.source.pages_used)).toBe(true);

        // company_brief
        expect(kit.company_brief).toBeDefined();
        expect(typeof kit.company_brief.summary).toBe('string');
        expect(typeof kit.company_brief.what_they_do).toBe('string');
        expect(Array.isArray(kit.company_brief.sources)).toBe(true);

        // role
        expect(kit.role).toBeDefined();
        expect(typeof kit.role.title).toBe('string');
        expect(typeof kit.role.seniority).toBe('string');
        expect(Array.isArray(kit.role.responsibilities)).toBe(true);
        expect(Array.isArray(kit.role.requirements)).toBe(true);
        if (kit.role.requirements.length > 0) {
          const req = kit.role.requirements[0];
          expect(typeof req.id).toBe('string');
          expect(typeof req.text).toBe('string');
          expect(['technical', 'behavioural', 'domain']).toContain(req.kind);
          expect(['must', 'nice']).toContain(req.priority);
        }

        // questions
        expect(Array.isArray(kit.questions)).toBe(true);
        if (kit.questions.length > 0) {
          const q = kit.questions[0];
          expect(typeof q.id).toBe('string');
          expect(Array.isArray(q.requirement_ids)).toBe(true);
          expect(typeof q.category).toBe('string');
          expect(typeof q.prompt).toBe('string');
          expect(typeof q.answer_outline).toBe('string');
          expect([1, 2, 3]).toContain(q.difficulty);
        }

        // flashcards
        expect(Array.isArray(kit.flashcards)).toBe(true);
        if (kit.flashcards.length > 0) {
          const f = kit.flashcards[0];
          expect(typeof f.id).toBe('string');
          expect(typeof f.front).toBe('string');
          expect(typeof f.back).toBe('string');
          expect(Array.isArray(f.requirement_ids)).toBe(true);
        }

        // schedule
        expect(kit.schedule).toBeDefined();
        expect(typeof kit.schedule.days_available).toBe('number');
        expect(Array.isArray(kit.schedule.days)).toBe(true);
        if (kit.schedule.days.length > 0) {
          const day = kit.schedule.days[0];
          expect(typeof day.day).toBe('number');
          expect(typeof day.focus).toBe('string');
          expect(Array.isArray(day.question_ids)).toBe(true);
          expect(Number.isInteger(day.minutes)).toBe(true);
        }

        // coverage
        expect(kit.coverage).toBeDefined();
        expect(Array.isArray(kit.coverage.uncovered_requirement_ids)).toBe(true);
        expect(typeof kit.coverage.passes).toBe('number');
      } finally {
        removeSilent(inputPath);
        removeSilent(outputPath);
      }
    });
  });

  // ── Test 3: Invalid case (missing jd) → status 'failed', INVALID_CASE ─────

  describe('invalid case with missing jd field', () => {
    it('produces status "failed" with error.code === "INVALID_CASE"', async () => {
      const cases = [
        {
          id: 'case-2',
          // jd is intentionally omitted
          company_url: 'https://example.com',
          days: 7,
        },
      ];
      const inputPath  = writeTempJson('invalid-input', cases);
      const outputPath = path.join(os.tmpdir(), `evaluate-test-invalid-output-${Date.now()}.json`);

      try {
        process.argv = ['node', 'evaluate.ts', '--input', inputPath, '--output', outputPath];
        await main();

        const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        expect(output.kits).toHaveLength(1);

        const entry = output.kits[0];
        expect(entry.id).toBe('case-2');
        expect(entry.status).toBe('failed');
        expect(entry.kit).toBeNull();
        expect(entry.error).not.toBeNull();
        expect(entry.error.code).toBe('INVALID_CASE');
        expect(typeof entry.error.message).toBe('string');
        expect(entry.error.message.length).toBeGreaterThan(0);
        expect(entry.error.message.length).toBeLessThanOrEqual(512);
      } finally {
        removeSilent(inputPath);
        removeSilent(outputPath);
      }
    });
  });

  // ── Test 4: Two-case batch (one valid, one invalid) ───────────────────────

  describe('two-case batch with one valid and one invalid case', () => {
    it('processes both cases and records the correct statuses', async () => {
      const cases = [
        {
          id: 'case-1',
          jd: 'A comprehensive job description that meets the 50 character minimum',
          company_url: 'https://example.com',
          days: 7,
        },
        {
          id: 'case-2',
          // jd field missing intentionally
          company_url: 'https://example.com',
          days: 7,
        },
      ];
      const inputPath  = writeTempJson('two-case-input', cases);
      const outputPath = path.join(os.tmpdir(), `evaluate-test-two-case-output-${Date.now()}.json`);

      try {
        process.argv = ['node', 'evaluate.ts', '--input', inputPath, '--output', outputPath];
        await main();

        const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

        // Top-level shape
        expect(output.version).toBe('1.0');
        expect(typeof output.generated_at).toBe('string');
        expect(output.kits).toHaveLength(2);

        // First case (valid)
        const ok = output.kits.find((k: { id: string }) => k.id === 'case-1');
        expect(ok).toBeDefined();
        expect(ok.status).toBe('ok');
        expect(ok.kit).not.toBeNull();
        expect(ok.error).toBeNull();

        // Second case (invalid — missing jd)
        const failed = output.kits.find((k: { id: string }) => k.id === 'case-2');
        expect(failed).toBeDefined();
        expect(failed.status).toBe('failed');
        expect(failed.kit).toBeNull();
        expect(failed.error.code).toBe('INVALID_CASE');
      } finally {
        removeSilent(inputPath);
        removeSilent(outputPath);
      }
    });
  });

  // ── Test 5: Missing --input/--output arguments → exit(1) ─────────────────

  describe('missing CLI arguments', () => {
    it('calls process.exit(1) when --input or --output are not provided', async () => {
      process.argv = ['node', 'evaluate.ts']; // no --input or --output

      await main().catch(() => { /* swallow rejection from exit mock */ });

      expect(exitMock).toHaveBeenCalledWith(1);
    });
  });

  // ── Test 6: Non-existent input file → exit(1) ─────────────────────────────

  describe('non-existent input file', () => {
    it('calls process.exit(1) when the input file does not exist', async () => {
      const missingPath = path.join(os.tmpdir(), `evaluate-test-nonexistent-${Date.now()}.json`);
      const outputPath  = path.join(os.tmpdir(), `evaluate-test-none-output-${Date.now()}.json`);

      try {
        process.argv = ['node', 'evaluate.ts', '--input', missingPath, '--output', outputPath];
        await main().catch(() => { /* swallow */ });

        expect(exitMock).toHaveBeenCalledWith(1);
      } finally {
        removeSilent(outputPath);
      }
    });
  });

  // ── Test 7: Input is not a JSON array → exit(1) ───────────────────────────

  describe('input file not a JSON array', () => {
    it('calls process.exit(1) when the input file contains a JSON object instead of an array', async () => {
      const inputPath  = writeTempJson('not-array', { id: 'oops', jd: 'hello' });
      const outputPath = path.join(os.tmpdir(), `evaluate-test-notarray-output-${Date.now()}.json`);

      try {
        process.argv = ['node', 'evaluate.ts', '--input', inputPath, '--output', outputPath];
        await main().catch(() => { /* swallow */ });

        expect(exitMock).toHaveBeenCalledWith(1);
      } finally {
        removeSilent(inputPath);
        removeSilent(outputPath);
      }
    });
  });
});
