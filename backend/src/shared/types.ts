/**
 * Shared TypeScript types for the AI Interview Prep Kit.
 * These interfaces define the full Kit schema (Appendix A) as well as
 * Mongoose document shapes for backend use.
 */

// ---------------------------------------------------------------------------
// Role / Requirement
// ---------------------------------------------------------------------------

/**
 * A single extracted requirement from a job description.
 * Requirements are the backbone of the kit — questions and flashcards link
 * back to them via their `requirement_ids` arrays.
 */
export interface Requirement {
  /** Stable ID assigned during extraction, e.g. "r1", "r2". */
  id: string;
  /** The extracted requirement text. */
  text: string;
  /** Semantic category of the requirement. */
  kind: 'technical' | 'behavioural' | 'domain';
  /**
   * Priority derived from signal words in the job description.
   * "must"  → "required", "must have", "essential"
   * "nice"  → "bonus", "preferred", "nice to have", or default
   */
  priority: 'must' | 'nice';
}

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

/**
 * A single generated interview question linked to one or more requirements.
 * Questions carry a `pinned` flag that is set to `true` whenever the user
 * edits or creates the question — protecting it from section regeneration.
 */
export interface Question {
  /** Stable ID assigned during generation, e.g. "q1", "q2". */
  id: string;
  /** IDs of the requirements this question covers. */
  requirement_ids: string[];
  /** Which interview category the question belongs to. */
  category: 'technical' | 'behavioural' | 'system-design' | 'company-fit';
  /** The interview question prompt. */
  prompt: string;
  /** A suggested answer outline / bullet points. */
  answer_outline: string;
  /** Difficulty rating: 1 = easy, 2 = medium, 3 = hard. */
  difficulty: 1 | 2 | 3;
  /**
   * PinnedState — `true` when the user has edited or created this question.
   * Pinned questions are preserved unchanged during section regeneration.
   * Default: `false`.
   */
  pinned: boolean;
}

// ---------------------------------------------------------------------------
// Flashcard
// ---------------------------------------------------------------------------

/**
 * A front/back study flashcard linked to one or more requirements.
 * Like Questions, flashcards carry a `pinned` flag for user-edited items.
 */
export interface Flashcard {
  /** Stable ID assigned during generation, e.g. "f1", "f2". */
  id: string;
  /** The question or prompt shown on the front of the card. */
  front: string;
  /** The answer or explanation shown on the back of the card. */
  back: string;
  /** IDs of the requirements this flashcard covers. */
  requirement_ids: string[];
  /**
   * PinnedState — `true` when the user has edited or created this flashcard.
   * Default: `false`.
   */
  pinned: boolean;
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/**
 * A single entry in the study schedule, representing one day's preparation.
 */
export interface DayEntry {
  /** 1-based day number within the schedule. */
  day: number;
  /** Human-readable focus label, e.g. "Technical: React, System Design". */
  focus: string;
  /** Ordered list of question IDs to study on this day. */
  question_ids: string[];
  /**
   * Estimated preparation time in whole minutes.
   * Always equals `15 * question_ids.length` (Requirement 10.8).
   */
  minutes: number;
}

// ---------------------------------------------------------------------------
// Kit (Appendix A schema)
// ---------------------------------------------------------------------------

/**
 * The complete interview preparation kit.
 * This is the canonical schema used in output files and API responses.
 */
export interface Kit {
  /** Metadata about the source job description and crawl session. */
  source: {
    /** Company name extracted from the crawled site or JD. */
    company: string;
    /** Normalised company website URL. */
    company_url: string;
    /** Role/job title extracted from the JD. */
    role: string;
    /** Location extracted from the JD (may be empty string if remote/not found). */
    location: string;
    /** Character length of the original job description (after trimming). */
    jd_chars: number;
    /** ISO 8601 timestamp of when the research/crawl step ran. */
    researched_at: string;
    /** List of URLs that contributed to the company brief. */
    pages_used: string[];
  };

  /** Company context generated from crawled pages and research. */
  company_brief: {
    /** One-paragraph summary of what the company does. */
    summary: string;
    /** Longer description of the company's products/services/culture. */
    what_they_do: string;
    /** Source URLs used to generate this brief. */
    sources: string[];
  };

  /** Role breakdown extracted from the job description. */
  role: {
    /** Full job title. */
    title: string;
    /** Seniority level (e.g. "Senior", "Mid-level", "Junior", "Staff"). */
    seniority: string;
    /** Key responsibilities listed in the JD. */
    responsibilities: string[];
    /** Extracted requirements — the atomic skills/competencies. */
    requirements: Requirement[];
  };

  /** All generated interview questions across all categories. */
  questions: Question[];

  /** All generated study flashcards. */
  flashcards: Flashcard[];

  /** Day-by-day study schedule allocating questions to days. */
  schedule: {
    /** Number of days the user specified (mirrors the creation input). */
    days_available: number;
    /** One entry per day, exactly `days_available` entries. */
    days: DayEntry[];
  };

  /** Coverage summary after the gap-fill loop. */
  coverage: {
    /**
     * IDs of must-have requirements that still have no covering question
     * after all coverage passes. Empty array = full coverage achieved.
     */
    uncovered_requirement_ids: string[];
    /**
     * Total number of coverage-check passes executed.
     * Pass 1 = the check after the initial question generation.
     */
    passes: number;
  };
}

// ---------------------------------------------------------------------------
// KitDocument (Mongoose / backend)
// ---------------------------------------------------------------------------

/**
 * The Kit as stored in MongoDB, extending the canonical Kit schema with
 * backend-specific fields for ownership, lifecycle state, and deduplication.
 *
 * Used in the backend Mongoose model; not exposed directly to the frontend.
 */
export interface KitDocument extends Kit {
  /** MongoDB ObjectId (as string representation in TypeScript land). */
  _id: string;

  /**
   * Owner's MongoDB ObjectId.
   * All kit routes verify this matches the authenticated user's ID.
   */
  userId: string;

  /**
   * Lifecycle state of the kit.
   * - `pending`    — created, pipeline not yet started
   * - `generating` — pipeline is actively running
   * - `ready`      — pipeline completed successfully
   * - `failed`     — pipeline encountered an unrecoverable error
   */
  status: 'pending' | 'generating' | 'ready' | 'failed';

  /**
   * Stores the last pipeline error message when `status === 'failed'`.
   * Undefined (absent) when the kit is in any other state.
   */
  pipelineError?: string;

  /**
   * Deduplication fingerprint computed as:
   *   sha256(normalise(jobDescription) + '|' + normalise(companyUrl))
   * where normalise = lowercase + trim whitespace.
   * Indexed as a unique compound key on (userId, dedupeKey).
   */
  dedupeKey: string;

  /** Mongoose-managed creation timestamp. */
  createdAt: Date;

  /** Mongoose-managed last-update timestamp. */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// FlashcardProgress (Practice Mode)
// ---------------------------------------------------------------------------

/**
 * A single confidence rating recorded during a practice session.
 */
export interface RatingEntry {
  /**
   * Confidence level selected by the user:
   * 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
   */
  confidence: 1 | 2 | 3 | 4;
  /** UTC timestamp of when the rating was recorded. */
  ratedAt: Date;
}

/**
 * Per-flashcard practice progress stored in a separate MongoDB collection.
 * Kept separate from the Kit document to prevent unbounded document growth
 * during repeated practice sessions.
 */
export interface FlashcardProgressDocument {
  /** MongoDB ObjectId. */
  _id: string;

  /** Owner's MongoDB ObjectId (matches the parent Kit's `userId`). */
  userId: string;

  /** MongoDB ObjectId of the parent Kit document. */
  kitId: string;

  /**
   * The `id` of the `Flashcard` within the Kit this progress record tracks
   * (e.g. "f1"). This is NOT the MongoDB `_id` — it is the application-level
   * stable flashcard identifier.
   */
  flashcardId: string;

  /** Chronological list of all confidence ratings for this flashcard. */
  ratings: RatingEntry[];

  /**
   * Cached arithmetic mean of all `confidence` values in `ratings`.
   * Recomputed and persisted on every new rating.
   * Used by `GET /practice/deck` to order cards ascending (weakest first).
   * Cards with no ratings are treated as `meanConfidence = 0`.
   */
  meanConfidence: number;

  /** Mongoose-managed creation timestamp. */
  createdAt: Date;

  /** Mongoose-managed last-update timestamp. */
  updatedAt: Date;
}
