/**
 * Property test for the Kit serialiser.
 *
 * Feature: ai-interview-prep-kit, Property 13: Kit serialisation round-trip
 *
 * Validates: Requirements 19.3
 *
 * Property 13: For any valid Kit object, serialising it to JSON via
 * `serialiseKit` and then parsing that JSON string via `validateKit` SHALL
 * produce a Kit object whose re-serialisation is byte-for-byte identical to
 * the original serialised string.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { serialiseKit } from '../serialiser';
import { validateKit, isValidationError } from '../validator';
import type { Kit, Requirement, Question, Flashcard, DayEntry } from '../types';

// ---------------------------------------------------------------------------
// Arbitraries for each Kit sub-type
// ---------------------------------------------------------------------------

/**
 * Generates valid non-empty strings constrained to printable ASCII so that
 * JSON round-trips don't introduce unexpected escape sequences that could
 * affect byte-for-byte comparison.
 */
const nonEmptyString = (maxLength = 80) =>
  fc.string({ minLength: 1, maxLength }).filter(s => s.trim().length > 0);

/** Generates a valid ISO 8601 datetime string by building from a Date. */
const arbitraryIso8601 = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date('2000-01-01'), max: new Date('2099-12-31') }).map(d =>
    d.toISOString()
  );

const arbitraryRequirement = (): fc.Arbitrary<Requirement> =>
  fc.record({
    id: nonEmptyString(10),
    text: nonEmptyString(100),
    kind: fc.constantFrom('technical', 'behavioural', 'domain') as fc.Arbitrary<
      'technical' | 'behavioural' | 'domain'
    >,
    priority: fc.constantFrom('must', 'nice') as fc.Arbitrary<'must' | 'nice'>,
  });

/**
 * Builds a Question arbitrary that references IDs from the provided
 * requirement ID pool and question ID pool.
 */
const arbitraryQuestion = (
  requirementIds: string[],
  questionId: string
): fc.Arbitrary<Question> =>
  fc
    .array(fc.constantFrom(...(requirementIds.length > 0 ? requirementIds : ['r0'])), {
      minLength: 0,
      maxLength: Math.min(3, requirementIds.length || 1),
    })
    .map(reqIds => ({
      id: questionId,
      requirement_ids: [...new Set(reqIds)],
      category: fc.sample(
        fc.constantFrom(
          'technical',
          'behavioural',
          'system-design',
          'company-fit'
        ) as fc.Arbitrary<'technical' | 'behavioural' | 'system-design' | 'company-fit'>,
        1
      )[0],
      prompt: fc.sample(nonEmptyString(80), 1)[0],
      answer_outline: fc.sample(nonEmptyString(80), 1)[0],
      difficulty: fc.sample(fc.constantFrom(1, 2, 3) as fc.Arbitrary<1 | 2 | 3>, 1)[0],
      pinned: fc.sample(fc.boolean(), 1)[0],
    }));

const arbitraryFlashcard = (
  requirementIds: string[],
  flashcardId: string
): fc.Arbitrary<Flashcard> =>
  fc
    .array(fc.constantFrom(...(requirementIds.length > 0 ? requirementIds : ['r0'])), {
      minLength: 0,
      maxLength: Math.min(3, requirementIds.length || 1),
    })
    .map(reqIds => ({
      id: flashcardId,
      front: fc.sample(nonEmptyString(80), 1)[0],
      back: fc.sample(nonEmptyString(80), 1)[0],
      requirement_ids: [...new Set(reqIds)],
      pinned: fc.sample(fc.boolean(), 1)[0],
    }));

/**
 * Builds a complete, self-consistent valid Kit arbitrary.
 *
 * Cross-reference consistency rules enforced:
 * - Requirement IDs used in questions / flashcards exist in role.requirements
 * - Question IDs used in schedule.days[*].question_ids exist in kit.questions
 * - schedule.days_available === schedule.days.length
 * - Each day's minutes === 15 * question_ids.length
 */
const arbitraryKit = (): fc.Arbitrary<Kit> =>
  fc
    .tuple(
      // 1–4 requirements
      fc.array(arbitraryRequirement(), { minLength: 1, maxLength: 4 }),
      // 1–4 questions (count)
      fc.integer({ min: 1, max: 4 }),
      // 0–2 flashcards (count)
      fc.integer({ min: 0, max: 2 }),
      // 1–5 days
      fc.integer({ min: 1, max: 5 }),
      // source fields
      nonEmptyString(30), // company
      nonEmptyString(30), // role title
      nonEmptyString(20), // location
      arbitraryIso8601(),
      // company_brief fields
      nonEmptyString(80), // summary
      nonEmptyString(80), // what_they_do
      // role fields
      nonEmptyString(20), // seniority
    )
    .chain(
      ([
        rawRequirements,
        questionCount,
        flashcardCount,
        daysAvailable,
        company,
        roleTitle,
        location,
        researchedAt,
        summary,
        whatTheyDo,
        seniority,
      ]) => {
        // Deduplicate requirement IDs to guarantee uniqueness
        const requirements: Requirement[] = rawRequirements.map((r, i) => ({
          ...r,
          id: `r${i + 1}`,
        }));
        const requirementIds = requirements.map(r => r.id);

        // Build questions synchronously (fc.chain gives us a new arbitrary)
        return fc
          .tuple(
            // question arbitraries — one per count
            ...Array.from({ length: questionCount }, (_, i) =>
              arbitraryQuestion(requirementIds, `q${i + 1}`)
            ),
            // flashcard arbitraries
            ...Array.from({ length: flashcardCount }, (_, i) =>
              arbitraryFlashcard(requirementIds, `f${i + 1}`)
            ),
          )
          .map(items => {
            const questions = items.slice(0, questionCount) as Question[];
            const flashcards = items.slice(questionCount) as Flashcard[];
            const questionIds = questions.map(q => q.id);

            // Build schedule: distribute question IDs round-robin across days
            const days: DayEntry[] = Array.from({ length: daysAvailable }, (_, i) => {
              // Distribute question IDs evenly; each day gets at least 1
              const dayQIds = questionIds.filter(
                (_, qi) => qi % daysAvailable === i
              );
              // Ensure every day has at least the first question to avoid empty days
              const finalQIds = dayQIds.length > 0 ? dayQIds : [questionIds[0]];
              return {
                day: i + 1,
                focus: `Day ${i + 1}`,
                question_ids: finalQIds,
                minutes: 15 * finalQIds.length,
              };
            });

            const kit: Kit = {
              source: {
                company,
                company_url: 'https://example.com',
                role: roleTitle,
                location,
                jd_chars: 100,
                researched_at: researchedAt,
                pages_used: [],
              },
              company_brief: {
                summary,
                what_they_do: whatTheyDo,
                sources: [],
              },
              role: {
                title: roleTitle,
                seniority,
                responsibilities: [],
                requirements,
              },
              questions,
              flashcards,
              schedule: {
                days_available: daysAvailable,
                days,
              },
              coverage: {
                uncovered_requirement_ids: [],
                passes: 1,
              },
            };

            return kit;
          });
      }
    );

// ---------------------------------------------------------------------------
// Property 13: Kit serialisation round-trip
// ---------------------------------------------------------------------------

describe('serialiseKit — Property 13: round-trip', () => {
  it(
    'serialiseKit → JSON.parse → validateKit → serialiseKit produces identical string for any valid Kit',
    () => {
      // Feature: ai-interview-prep-kit, Property 13: Kit serialisation round-trip
      fc.assert(
        fc.property(arbitraryKit(), kit => {
          // Step 1: serialise the generated kit
          const firstSerialised = serialiseKit(kit);

          // Step 2: parse it back to a plain object
          const parsed = JSON.parse(firstSerialised) as unknown;

          // Step 3: validate — must succeed (no ValidationError)
          const validated = validateKit(parsed);
          if (isValidationError(validated)) {
            // If validation fails on a generated kit, surface which fields failed
            const fieldList = validated.errors.map(e => `${e.field}: ${e.message}`).join('\n');
            throw new Error(
              `validateKit rejected a kit that should be valid.\nErrors:\n${fieldList}`
            );
          }

          // Step 4: re-serialise the validated Kit
          const secondSerialised = serialiseKit(validated);

          // Property: the two serialised strings must be byte-for-byte identical
          expect(secondSerialised).toBe(firstSerialised);
        }),
        { numRuns: 100 }
      );
    }
  );
});
