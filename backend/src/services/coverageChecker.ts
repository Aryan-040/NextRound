import type { Requirement, Question } from '../shared';

/**
 * The result of a coverage check over a set of requirements and questions.
 */
export interface CoverageResult {
  /** Must-have requirement IDs that have no covering question. */
  uncoveredRequirementIds: string[];
  /** Must-have requirement IDs that are covered by at least one question. */
  coveredRequirementIds: string[];
}

/**
 * Pure deterministic coverage checker — no I/O, no LLM calls.
 *
 * Computes which must-have requirements are covered (i.e. appear in at least
 * one question's `requirement_ids`) and which are not.
 *
 * Nice-to-have requirements are intentionally excluded from both output
 * arrays: coverage is only a concern for must-have requirements.
 */
export function checkCoverage(
  requirements: Requirement[],
  questions: Question[],
): CoverageResult {
  const mustHaveIds = new Set(
    requirements.filter(r => r.priority === 'must').map(r => r.id),
  );

  const coveredIds = new Set(questions.flatMap(q => q.requirement_ids));

  return {
    uncoveredRequirementIds: [...mustHaveIds].filter(id => !coveredIds.has(id)),
    coveredRequirementIds: [...coveredIds].filter(id => mustHaveIds.has(id)),
  };
}
