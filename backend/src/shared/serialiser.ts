/**
 * Kit serialiser for the AI Interview Prep Kit.
 *
 * Serialises a validated `Kit` to a JSON string with a fixed, deterministic
 * key ordering that mirrors the Appendix A field order.
 *
 * Determinism guarantee
 * ─────────────────────
 * The same `Kit` value serialised twice will always produce the identical
 * string because:
 *   1. The top-level fields are assembled in a hard-coded literal object,
 *      not via `Object.keys()` (which is insertion-order-dependent at runtime).
 *   2. Every nested sub-object is likewise reconstructed with keys in the
 *      same fixed order.
 *   3. `JSON.stringify` is then called without a replacer — the ordering is
 *      established by the object construction, not by stringify.
 *
 * Round-trip property (Requirement 19.3)
 * ───────────────────────────────────────
 * `validateKit(JSON.parse(serialiseKit(kit)))` returns a Kit whose
 * re-serialisation is byte-for-byte identical to `serialiseKit(kit)`.
 * This holds because:
 *   – All field types round-trip losslessly through JSON (no Date objects,
 *     no Sets, no Symbols; ISO strings remain strings).
 *   – The reconstructed ordering is the same whether the input Kit object
 *     was built by the pipeline or parsed back from JSON.
 *
 * Requirements: 19.2, 19.3
 */

import type {
  Kit,
  Requirement,
  Question,
  Flashcard,
  DayEntry,
} from './types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialise a validated `Kit` to a JSON string conforming to Appendix A.
 *
 * Keys are ordered according to the Appendix A field sequence; the ordering
 * is deterministic across all calls for the same logical Kit value.
 *
 * @param kit A Kit that has already passed `validateKit`. Passing an
 *            un-validated object is supported but not recommended — the
 *            serialiser does not re-validate; it will silently include
 *            unrecognised extra fields if present on sub-objects.
 * @returns   Two-space-indented JSON string.
 */
export function serialiseKit(kit: Kit): string {
  return JSON.stringify(buildOrderedKit(kit), null, 2);
}

// ---------------------------------------------------------------------------
// Internal helpers — build ordered plain objects matching Appendix A layout
// ---------------------------------------------------------------------------

/**
 * Reconstruct the full Kit with every key in Appendix A field order.
 * The resulting plain object is passed directly to `JSON.stringify`.
 */
function buildOrderedKit(kit: Kit): object {
  return {
    source: buildOrderedSource(kit.source),
    company_brief: buildOrderedCompanyBrief(kit.company_brief),
    role: buildOrderedRole(kit.role),
    questions: kit.questions.map(buildOrderedQuestion),
    flashcards: kit.flashcards.map(buildOrderedFlashcard),
    schedule: buildOrderedSchedule(kit.schedule),
    coverage: buildOrderedCoverage(kit.coverage),
  };
}

function buildOrderedSource(
  s: Kit['source'],
): object {
  return {
    company: s.company,
    company_url: s.company_url,
    role: s.role,
    location: s.location,
    jd_chars: s.jd_chars,
    researched_at: s.researched_at,
    pages_used: s.pages_used,
  };
}

function buildOrderedCompanyBrief(
  b: Kit['company_brief'],
): object {
  return {
    summary: b.summary,
    what_they_do: b.what_they_do,
    sources: b.sources,
  };
}

function buildOrderedRole(
  r: Kit['role'],
): object {
  return {
    title: r.title,
    seniority: r.seniority,
    responsibilities: r.responsibilities,
    requirements: r.requirements.map(buildOrderedRequirement),
  };
}

function buildOrderedRequirement(req: Requirement): object {
  return {
    id: req.id,
    text: req.text,
    kind: req.kind,
    priority: req.priority,
  };
}

function buildOrderedQuestion(q: Question): object {
  return {
    id: q.id,
    requirement_ids: q.requirement_ids,
    category: q.category,
    prompt: q.prompt,
    answer_outline: q.answer_outline,
    difficulty: q.difficulty,
    pinned: q.pinned,
  };
}

function buildOrderedFlashcard(f: Flashcard): object {
  return {
    id: f.id,
    front: f.front,
    back: f.back,
    requirement_ids: f.requirement_ids,
    pinned: f.pinned,
  };
}

function buildOrderedSchedule(
  s: Kit['schedule'],
): object {
  return {
    days_available: s.days_available,
    days: s.days.map(buildOrderedDayEntry),
  };
}

function buildOrderedDayEntry(d: DayEntry): object {
  return {
    day: d.day,
    focus: d.focus,
    question_ids: d.question_ids,
    minutes: d.minutes,
  };
}

function buildOrderedCoverage(
  c: Kit['coverage'],
): object {
  return {
    uncovered_requirement_ids: c.uncovered_requirement_ids,
    passes: c.passes,
  };
}
