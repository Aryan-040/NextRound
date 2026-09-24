import { describe, it, expect } from 'vitest';
import { checkCoverage } from '../coverageChecker';
import type { Requirement, Question } from '@interview-prep/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequirement(
  id: string,
  priority: 'must' | 'nice',
): Requirement {
  return {
    id,
    text: `Requirement ${id}`,
    kind: 'technical',
    priority,
  };
}

function makeQuestion(id: string, requirementIds: string[]): Question {
  return {
    id,
    requirement_ids: requirementIds,
    category: 'technical',
    prompt: `Question ${id}`,
    answer_outline: `Answer for ${id}`,
    difficulty: 1,
    pinned: false,
  };
}

// ---------------------------------------------------------------------------
// Tests — Requirement 20.4: covered → empty uncoveredRequirementIds
// ---------------------------------------------------------------------------

describe('checkCoverage', () => {
  it('returns empty uncoveredRequirementIds when all must-have requirements are covered', () => {
    // Requirements 20.4
    const requirements: Requirement[] = [
      makeRequirement('r1', 'must'),
      makeRequirement('r2', 'must'),
      makeRequirement('r3', 'must'),
    ];
    const questions: Question[] = [
      makeQuestion('q1', ['r1', 'r2']),
      makeQuestion('q2', ['r3']),
    ];

    const result = checkCoverage(requirements, questions);

    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.coveredRequirementIds).toContain('r1');
    expect(result.coveredRequirementIds).toContain('r2');
    expect(result.coveredRequirementIds).toContain('r3');
  });

  // ---------------------------------------------------------------------------
  // Tests — Requirement 20.5: uncovered must-have ID surfaces correctly
  // ---------------------------------------------------------------------------

  it('includes the uncovered must-have requirement ID when one question is missing', () => {
    // Requirements 20.5
    const requirements: Requirement[] = [
      makeRequirement('r1', 'must'),
      makeRequirement('r2', 'must'),
    ];
    const questions: Question[] = [
      makeQuestion('q1', ['r1']),
      // r2 deliberately not referenced by any question
    ];

    const result = checkCoverage(requirements, questions);

    expect(result.uncoveredRequirementIds).toEqual(['r2']);
    expect(result.coveredRequirementIds).toEqual(['r1']);
  });

  it('lists all uncovered must-have IDs when no questions exist', () => {
    const requirements: Requirement[] = [
      makeRequirement('r1', 'must'),
      makeRequirement('r2', 'must'),
    ];
    const questions: Question[] = [];

    const result = checkCoverage(requirements, questions);

    expect(result.uncoveredRequirementIds).toContain('r1');
    expect(result.uncoveredRequirementIds).toContain('r2');
    expect(result.coveredRequirementIds).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Tests — nice-to-have requirements are excluded from coverage computation
  // ---------------------------------------------------------------------------

  it('does not include nice-to-have requirements in uncoveredRequirementIds even when not covered', () => {
    const requirements: Requirement[] = [
      makeRequirement('r1', 'must'),
      makeRequirement('r2', 'nice'),  // not covered by any question
      makeRequirement('r3', 'nice'),  // not covered by any question
    ];
    const questions: Question[] = [
      makeQuestion('q1', ['r1']),
    ];

    const result = checkCoverage(requirements, questions);

    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.uncoveredRequirementIds).not.toContain('r2');
    expect(result.uncoveredRequirementIds).not.toContain('r3');
  });

  it('does not include nice-to-have requirements in coveredRequirementIds even when covered', () => {
    const requirements: Requirement[] = [
      makeRequirement('r1', 'must'),
      makeRequirement('r2', 'nice'),
    ];
    const questions: Question[] = [
      makeQuestion('q1', ['r1', 'r2']),  // covers both, but r2 is nice
    ];

    const result = checkCoverage(requirements, questions);

    expect(result.coveredRequirementIds).toEqual(['r1']);
    expect(result.coveredRequirementIds).not.toContain('r2');
  });

  // ---------------------------------------------------------------------------
  // Tests — empty requirements array
  // ---------------------------------------------------------------------------

  it('returns empty arrays when requirements array is empty', () => {
    const requirements: Requirement[] = [];
    const questions: Question[] = [
      makeQuestion('q1', ['r1']),
    ];

    const result = checkCoverage(requirements, questions);

    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.coveredRequirementIds).toEqual([]);
  });

  it('returns empty arrays when both requirements and questions are empty', () => {
    const result = checkCoverage([], []);

    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.coveredRequirementIds).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Tests — mixed priorities
  // ---------------------------------------------------------------------------

  it('correctly handles a mix of must-have and nice-to-have requirements', () => {
    const requirements: Requirement[] = [
      makeRequirement('r1', 'must'),
      makeRequirement('r2', 'must'),
      makeRequirement('r3', 'nice'),
      makeRequirement('r4', 'nice'),
    ];
    const questions: Question[] = [
      makeQuestion('q1', ['r1']),
      // r2 uncovered, r3 and r4 are nice — should not appear anywhere
    ];

    const result = checkCoverage(requirements, questions);

    expect(result.uncoveredRequirementIds).toEqual(['r2']);
    expect(result.coveredRequirementIds).toEqual(['r1']);
  });

  it('a question covering only nice-to-have requirements does not affect must-have coverage', () => {
    const requirements: Requirement[] = [
      makeRequirement('r1', 'must'),
      makeRequirement('r2', 'nice'),
    ];
    const questions: Question[] = [
      makeQuestion('q1', ['r2']),  // covers only a nice-to-have
    ];

    const result = checkCoverage(requirements, questions);

    expect(result.uncoveredRequirementIds).toEqual(['r1']);
    expect(result.coveredRequirementIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Property-Based Tests — Property 6: Coverage checker correctness
// Feature: ai-interview-prep-kit, Property 6: Coverage checker correctness
// Validates: Requirements 9.1, 9.4
// ---------------------------------------------------------------------------

import * as fc from 'fast-check';

// Arbitraries

function arbitraryRequirement(): fc.Arbitrary<Requirement> {
  return fc.record({
    id:       fc.string({ minLength: 1, maxLength: 10 }).map(s => `r_${s}`),
    text:     fc.string({ minLength: 1, maxLength: 50 }),
    kind:     fc.constantFrom('technical', 'behavioural', 'domain') as fc.Arbitrary<'technical' | 'behavioural' | 'domain'>,
    priority: fc.constantFrom('must', 'nice') as fc.Arbitrary<'must' | 'nice'>,
  });
}

function arbitraryQuestion(requirementIds: string[]): fc.Arbitrary<Question> {
  // Each question references a random subset of the known requirement IDs,
  // or a standalone foreign ID that won't match any requirement.
  const idsArb = requirementIds.length > 0
    ? fc.array(fc.constantFrom(...requirementIds), { minLength: 0, maxLength: requirementIds.length })
    : fc.constant([] as string[]);

  return fc.record({
    id:             fc.string({ minLength: 1, maxLength: 10 }).map(s => `q_${s}`),
    requirement_ids: idsArb,
    category:        fc.constantFrom('technical', 'behavioural', 'system-design', 'company-fit') as fc.Arbitrary<'technical' | 'behavioural' | 'system-design' | 'company-fit'>,
    prompt:          fc.string({ minLength: 1, maxLength: 50 }),
    answer_outline:  fc.string({ minLength: 1, maxLength: 50 }),
    difficulty:      fc.constantFrom(1, 2, 3) as fc.Arbitrary<1 | 2 | 3>,
    pinned:          fc.boolean(),
  });
}

describe('checkCoverage — Property 6: Coverage checker correctness', () => {
  it('uncoveredRequirementIds is exactly the must-have IDs absent from all question requirement_ids', () => {
    // Feature: ai-interview-prep-kit, Property 6: Coverage checker correctness
    fc.assert(
      fc.property(
        fc.array(arbitraryRequirement(), { minLength: 0, maxLength: 15 }),
        (requirements) => {
          // Derive question arbitraries from the actual requirement IDs present
          const reqIds = requirements.map(r => r.id);
          return fc.sample(
            fc.array(arbitraryQuestion(reqIds), { minLength: 0, maxLength: 10 }),
            1,
          ).every((questions) => {
            const result = checkCoverage(requirements, questions);

            const mustHaveIds = new Set(
              requirements.filter(r => r.priority === 'must').map(r => r.id),
            );
            const allCoveredIds = new Set(questions.flatMap(q => q.requirement_ids));

            // Compute expected sets
            const expectedUncovered = [...mustHaveIds].filter(id => !allCoveredIds.has(id));
            const expectedCovered   = [...mustHaveIds].filter(id => allCoveredIds.has(id));

            // 1. uncoveredRequirementIds must equal the expected uncovered set (no more, no fewer)
            const actualUncoveredSet   = new Set(result.uncoveredRequirementIds);
            const expectedUncoveredSet = new Set(expectedUncovered);
            if (actualUncoveredSet.size !== expectedUncoveredSet.size) return false;
            for (const id of expectedUncoveredSet) {
              if (!actualUncoveredSet.has(id)) return false;
            }

            // 2. No duplicates in uncoveredRequirementIds
            if (result.uncoveredRequirementIds.length !== actualUncoveredSet.size) return false;

            // 3. coveredRequirementIds must equal the expected covered set (no more, no fewer)
            const actualCoveredSet   = new Set(result.coveredRequirementIds);
            const expectedCoveredSet = new Set(expectedCovered);
            if (actualCoveredSet.size !== expectedCoveredSet.size) return false;
            for (const id of expectedCoveredSet) {
              if (!actualCoveredSet.has(id)) return false;
            }

            // 4. No duplicates in coveredRequirementIds
            if (result.coveredRequirementIds.length !== actualCoveredSet.size) return false;

            // 5. No nice-to-have IDs may appear in either output array
            const niceIds = new Set(
              requirements.filter(r => r.priority === 'nice').map(r => r.id),
            );
            for (const id of result.uncoveredRequirementIds) {
              if (niceIds.has(id)) return false;
            }
            for (const id of result.coveredRequirementIds) {
              if (niceIds.has(id)) return false;
            }

            return true;
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
