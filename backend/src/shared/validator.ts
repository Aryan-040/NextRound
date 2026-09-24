/**
 * Kit schema validator for the AI Interview Prep Kit.
 *
 * Validates a plain `unknown` value against the full Appendix A schema and
 * returns either a well-typed `Kit` (success) or a `ValidationError` carrying
 * a structured list of all field failures (failure).
 *
 * Design notes
 * ─────────────
 * • The validator is intentionally dependency-free — no Zod, no Ajv.
 * • Every discovered error is accumulated before returning so callers receive
 *   a complete list of problems, not just the first one.
 * • Cross-field constraints (requirement_id references, question_id references)
 *   are checked after individual field types are confirmed to avoid spurious
 *   secondary errors caused by an already-reported type error.
 */

import type {
  Kit,
  Requirement,
  Question,
  Flashcard,
  DayEntry,
} from './types';

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------

/**
 * A single validation failure describing exactly which field failed and why.
 */
export interface FieldError {
  /** JSON-path-like string identifying the invalid field, e.g.
   *  "questions[2].difficulty" or "schedule.days[0].minutes". */
  field: string;
  /** Human-readable description of the failure. */
  message: string;
}

/**
 * Returned by `validateKit` when the input does not conform to the Kit schema.
 * The `errors` array contains one entry per invalid field.
 */
export interface ValidationError {
  /** Discriminant — always `'ValidationError'`. */
  type: 'ValidationError';
  /** Every validation failure found; never empty. */
  errors: FieldError[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate `obj` against the full Kit schema (Appendix A).
 *
 * @returns The typed `Kit` on success, or a `ValidationError` listing every
 *          invalid field on failure.
 *
 * Requirements: 8.1–8.10, 19.1, 19.4, 19.5
 */
export function validateKit(obj: unknown): Kit | ValidationError {
  const errors: FieldError[] = [];

  if (!isObject(obj)) {
    errors.push({ field: '(root)', message: 'Kit must be a non-null object' });
    return { type: 'ValidationError', errors };
  }

  const kit = obj as Record<string, unknown>;

  // ── source ──────────────────────────────────────────────────────────────
  validateSource(kit['source'], 'source', errors);

  // ── company_brief ────────────────────────────────────────────────────────
  validateCompanyBrief(kit['company_brief'], 'company_brief', errors);

  // ── role ─────────────────────────────────────────────────────────────────
  const requirements = validateRole(kit['role'], 'role', errors);

  // ── questions ────────────────────────────────────────────────────────────
  const questions = validateQuestions(kit['questions'], 'questions', requirements, errors);

  // ── flashcards ───────────────────────────────────────────────────────────
  validateFlashcards(kit['flashcards'], 'flashcards', errors);

  // ── schedule ─────────────────────────────────────────────────────────────
  validateSchedule(kit['schedule'], 'schedule', questions, errors);

  // ── coverage ─────────────────────────────────────────────────────────────
  validateCoverage(kit['coverage'], 'coverage', errors);

  if (errors.length > 0) {
    return { type: 'ValidationError', errors };
  }

  return obj as unknown as Kit;
}

/**
 * Type guard: check whether `validateKit` returned an error.
 */
export function isValidationError(result: Kit | ValidationError): result is ValidationError {
  return (result as ValidationError).type === 'ValidationError';
}

// ---------------------------------------------------------------------------
// Section validators (each accumulates into `errors`)
// ---------------------------------------------------------------------------

function validateSource(
  val: unknown,
  path: string,
  errors: FieldError[],
): void {
  if (!isObject(val)) {
    errors.push({ field: path, message: 'Must be an object' });
    return;
  }
  const s = val as Record<string, unknown>;

  requireString(s['company'],        `${path}.company`,       errors);
  requireString(s['company_url'],    `${path}.company_url`,   errors);
  requireString(s['role'],           `${path}.role`,          errors);
  requireString(s['location'],       `${path}.location`,      errors);
  requireInteger(s['jd_chars'],      `${path}.jd_chars`,      errors, { min: 0 });
  requireIso8601(s['researched_at'], `${path}.researched_at`, errors);
  requireStringArray(s['pages_used'], `${path}.pages_used`,   errors);
}

function validateCompanyBrief(
  val: unknown,
  path: string,
  errors: FieldError[],
): void {
  if (!isObject(val)) {
    errors.push({ field: path, message: 'Must be an object' });
    return;
  }
  const b = val as Record<string, unknown>;

  requireString(b['summary'],      `${path}.summary`,      errors);
  requireString(b['what_they_do'], `${path}.what_they_do`, errors);
  requireStringArray(b['sources'], `${path}.sources`,      errors);
}

/**
 * Validates `role` and returns the validated `Requirement[]` (or empty array
 * on failure) so that downstream validators can use requirement IDs.
 */
function validateRole(
  val: unknown,
  path: string,
  errors: FieldError[],
): Set<string> {
  const requirementIds = new Set<string>();

  if (!isObject(val)) {
    errors.push({ field: path, message: 'Must be an object' });
    return requirementIds;
  }
  const r = val as Record<string, unknown>;

  requireString(r['title'],       `${path}.title`,       errors);
  requireString(r['seniority'],   `${path}.seniority`,   errors);
  requireStringArray(r['responsibilities'], `${path}.responsibilities`, errors);

  // requirements[]
  const reqPath = `${path}.requirements`;
  if (!Array.isArray(r['requirements'])) {
    errors.push({ field: reqPath, message: 'Must be an array' });
    return requirementIds;
  }

  for (let i = 0; i < (r['requirements'] as unknown[]).length; i++) {
    const req = (r['requirements'] as unknown[])[i] as Record<string, unknown>;
    const rp = `${reqPath}[${i}]`;

    if (!isObject(req)) {
      errors.push({ field: rp, message: 'Must be an object' });
      continue;
    }

    requireString(req['id'],   `${rp}.id`,   errors);
    requireString(req['text'], `${rp}.text`, errors);

    requireEnum(
      req['kind'],
      `${rp}.kind`,
      ['technical', 'behavioural', 'domain'],
      errors,
    );

    requireEnum(
      req['priority'],
      `${rp}.priority`,
      ['must', 'nice'],
      errors,
    );

    if (typeof req['id'] === 'string' && req['id']) {
      requirementIds.add(req['id'] as string);
    }
  }

  return requirementIds;
}

/**
 * Validates `questions` and returns the set of known question IDs for
 * cross-referencing in `schedule`.
 */
function validateQuestions(
  val: unknown,
  path: string,
  requirementIds: Set<string>,
  errors: FieldError[],
): Set<string> {
  const questionIds = new Set<string>();

  if (!Array.isArray(val)) {
    errors.push({ field: path, message: 'Must be an array' });
    return questionIds;
  }

  for (let i = 0; i < val.length; i++) {
    const q = val[i] as Record<string, unknown>;
    const qp = `${path}[${i}]`;

    if (!isObject(q)) {
      errors.push({ field: qp, message: 'Must be an object' });
      continue;
    }

    requireString(q['id'],             `${qp}.id`,             errors);
    requireStringArray(q['requirement_ids'], `${qp}.requirement_ids`, errors);

    requireEnum(
      q['category'],
      `${qp}.category`,
      ['technical', 'behavioural', 'system-design', 'company-fit'],
      errors,
    );

    requireString(q['prompt'],         `${qp}.prompt`,         errors);
    requireString(q['answer_outline'], `${qp}.answer_outline`, errors);

    // difficulty: integer 1–3
    if (!Number.isInteger(q['difficulty']) || (q['difficulty'] as number) < 1 || (q['difficulty'] as number) > 3) {
      errors.push({
        field: `${qp}.difficulty`,
        message: 'Must be an integer between 1 and 3 inclusive',
      });
    }

    // pinned: boolean
    if (typeof q['pinned'] !== 'boolean') {
      errors.push({ field: `${qp}.pinned`, message: 'Must be a boolean' });
    }

    // Cross-reference: requirement_ids must reference known requirements
    if (requirementIds.size > 0 && Array.isArray(q['requirement_ids'])) {
      (q['requirement_ids'] as unknown[]).forEach((rid, j) => {
        if (typeof rid === 'string' && !requirementIds.has(rid)) {
          errors.push({
            field: `${qp}.requirement_ids[${j}]`,
            message: `References unknown requirement id "${rid}"`,
          });
        }
      });
    }

    if (typeof q['id'] === 'string' && q['id']) {
      questionIds.add(q['id'] as string);
    }
  }

  return questionIds;
}

function validateFlashcards(
  val: unknown,
  path: string,
  errors: FieldError[],
): void {
  if (!Array.isArray(val)) {
    errors.push({ field: path, message: 'Must be an array' });
    return;
  }

  for (let i = 0; i < val.length; i++) {
    const f = val[i] as Record<string, unknown>;
    const fp = `${path}[${i}]`;

    if (!isObject(f)) {
      errors.push({ field: fp, message: 'Must be an object' });
      continue;
    }

    requireString(f['id'],    `${fp}.id`,    errors);
    requireString(f['front'], `${fp}.front`, errors);
    requireString(f['back'],  `${fp}.back`,  errors);
    requireStringArray(f['requirement_ids'], `${fp}.requirement_ids`, errors);

    // pinned: boolean
    if (typeof f['pinned'] !== 'boolean') {
      errors.push({ field: `${fp}.pinned`, message: 'Must be a boolean' });
    }
  }
}

function validateSchedule(
  val: unknown,
  path: string,
  questionIds: Set<string>,
  errors: FieldError[],
): void {
  if (!isObject(val)) {
    errors.push({ field: path, message: 'Must be an object' });
    return;
  }
  const s = val as Record<string, unknown>;

  requireInteger(s['days_available'], `${path}.days_available`, errors, { min: 1, max: 60 });

  const daysPath = `${path}.days`;
  if (!Array.isArray(s['days'])) {
    errors.push({ field: daysPath, message: 'Must be an array' });
    return;
  }

  for (let i = 0; i < (s['days'] as unknown[]).length; i++) {
    const d = (s['days'] as unknown[])[i] as Record<string, unknown>;
    const dp = `${daysPath}[${i}]`;

    if (!isObject(d)) {
      errors.push({ field: dp, message: 'Must be an object' });
      continue;
    }

    requireInteger(d['day'],     `${dp}.day`,     errors, { min: 1 });
    requireString(d['focus'],    `${dp}.focus`,   errors);
    requireStringArray(d['question_ids'], `${dp}.question_ids`, errors);

    // minutes: integer
    if (!Number.isInteger(d['minutes']) || typeof d['minutes'] !== 'number') {
      errors.push({ field: `${dp}.minutes`, message: 'Must be an integer' });
    }

    // Cross-reference: question_ids must reference known questions
    if (questionIds.size > 0 && Array.isArray(d['question_ids'])) {
      (d['question_ids'] as unknown[]).forEach((qid, j) => {
        if (typeof qid === 'string' && !questionIds.has(qid)) {
          errors.push({
            field: `${dp}.question_ids[${j}]`,
            message: `References unknown question id "${qid}"`,
          });
        }
      });
    }
  }
}

function validateCoverage(
  val: unknown,
  path: string,
  errors: FieldError[],
): void {
  if (!isObject(val)) {
    errors.push({ field: path, message: 'Must be an object' });
    return;
  }
  const c = val as Record<string, unknown>;

  requireStringArray(c['uncovered_requirement_ids'], `${path}.uncovered_requirement_ids`, errors);
  requireInteger(c['passes'], `${path}.passes`, errors, { min: 0 });
}

// ---------------------------------------------------------------------------
// Primitive assertion helpers
// ---------------------------------------------------------------------------

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function requireString(
  val: unknown,
  field: string,
  errors: FieldError[],
): boolean {
  if (typeof val !== 'string') {
    errors.push({ field, message: 'Must be a string' });
    return false;
  }
  return true;
}

function requireStringArray(
  val: unknown,
  field: string,
  errors: FieldError[],
): boolean {
  if (!Array.isArray(val)) {
    errors.push({ field, message: 'Must be an array of strings' });
    return false;
  }
  let ok = true;
  for (let i = 0; i < val.length; i++) {
    if (typeof val[i] !== 'string') {
      errors.push({ field: `${field}[${i}]`, message: 'Must be a string' });
      ok = false;
    }
  }
  return ok;
}

function requireInteger(
  val: unknown,
  field: string,
  errors: FieldError[],
  bounds?: { min?: number; max?: number },
): boolean {
  if (typeof val !== 'number' || !Number.isInteger(val)) {
    errors.push({ field, message: 'Must be an integer' });
    return false;
  }
  if (bounds?.min !== undefined && val < bounds.min) {
    errors.push({ field, message: `Must be at least ${bounds.min}` });
    return false;
  }
  if (bounds?.max !== undefined && val > bounds.max) {
    errors.push({ field, message: `Must be at most ${bounds.max}` });
    return false;
  }
  return true;
}

function requireEnum(
  val: unknown,
  field: string,
  allowed: string[],
  errors: FieldError[],
): boolean {
  if (typeof val !== 'string' || !allowed.includes(val)) {
    errors.push({
      field,
      message: `Must be one of: ${allowed.map(v => `"${v}"`).join(', ')}`,
    });
    return false;
  }
  return true;
}

function requireIso8601(
  val: unknown,
  field: string,
  errors: FieldError[],
): boolean {
  if (typeof val !== 'string') {
    errors.push({ field, message: 'Must be an ISO 8601 date string' });
    return false;
  }
  // Accept any string parseable by Date that produces a valid, non-NaN timestamp.
  const ts = Date.parse(val);
  if (Number.isNaN(ts)) {
    errors.push({ field, message: 'Must be a valid ISO 8601 date string' });
    return false;
  }
  return true;
}
