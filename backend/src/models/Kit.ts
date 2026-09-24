/**
 * Kit.ts
 * Mongoose model for the interview preparation kit document.
 *
 * The Kit document embeds all sub-arrays (questions, flashcards, schedule)
 * for atomic reads and single-document updates. Expected kit sizes (â‰¤ ~200
 * questions) stay well within MongoDB's 16 MB document limit.
 *
 * Indexes:
 *   { userId: 1 }                   â€” list kits by owner
 *   { userId: 1, dedupeKey: 1 }     â€” unique, prevents duplicate kits per user
 */

import { Schema, model, Document, Types } from 'mongoose';
import type { KitDocument } from '@interview-prep/shared';

// ---------------------------------------------------------------------------
// KitModelDocument â€” merges the shared KitDocument type with Mongoose Document
// ---------------------------------------------------------------------------

/**
 * The Kit as a full Mongoose document.
 * Extends the canonical `KitDocument` from the shared package (which already
 * includes all Kit fields plus userId, status, pipelineError, dedupeKey) and
 * layers on Mongoose's Document methods and the proper ObjectId types.
 */
export interface KitModelDocument extends Omit<KitDocument, '_id' | 'userId'>, Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
}

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const RequirementSchema = new Schema(
  {
    id:       { type: String, required: true },
    text:     { type: String, required: true },
    kind:     { type: String, required: true, enum: ['technical', 'behavioural', 'domain'] },
    priority: { type: String, required: true, enum: ['must', 'nice'] },
  },
  { _id: false }
);

const QuestionSchema = new Schema(
  {
    id:             { type: String, required: true },
    requirement_ids: { type: [String], required: true, default: [] },
    category:       {
      type: String,
      required: true,
      enum: ['technical', 'behavioural', 'system-design', 'company-fit'],
    },
    prompt:         { type: String, default: '' },
    answer_outline: { type: String, default: '' },
    difficulty:     { type: Number, required: true, enum: [1, 2, 3] },
    /**
     * PinnedState â€” set to true when the user edits or creates this question.
     * Pinned questions are preserved unchanged during section regeneration.
     */
    pinned:         { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const FlashcardSchema = new Schema(
  {
    id:              { type: String, required: true },
    front:           { type: String, default: '' },
    back:            { type: String, default: '' },
    requirement_ids: { type: [String], required: true, default: [] },
    /**
     * PinnedState â€” set to true when the user edits or creates this flashcard.
     */
    pinned:          { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const DayEntrySchema = new Schema(
  {
    day:          { type: Number, required: true },
    focus:        { type: String, required: true, default: '' },
    question_ids: { type: [String], required: true, default: [] },
    /** Always equals 15 Ã— question_ids.length (Requirement 10.8). */
    minutes:      { type: Number, required: true },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Root Kit schema
// ---------------------------------------------------------------------------

const KitSchema = new Schema<KitModelDocument>(
  {
    // â”€â”€ source â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    source: {
      type: new Schema(
        {
          company:       { type: String, default: '' },
          company_url:   { type: String, default: '' },
          role:          { type: String, default: '' },
          location:      { type: String, default: '' },
          jd_chars:      { type: Number, required: true, default: 0 },
          researched_at: { type: String, default: '' },
          pages_used:    { type: [String], required: true, default: [] },
        },
        { _id: false }
      ),
      required: true,
    },

    // â”€â”€ company_brief â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    company_brief: {
      type: new Schema(
        {
          summary:      { type: String, default: '' },
          what_they_do: { type: String, default: '' },
          sources:      { type: [String], required: true, default: [] },
        },
        { _id: false }
      ),
      required: true,
    },

    // â”€â”€ role â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    role: {
      type: new Schema(
        {
          title:            { type: String, default: '' },
          seniority:        { type: String, default: '' },
          responsibilities: { type: [String], required: true, default: [] },
          requirements:     { type: [RequirementSchema], required: true, default: [] },
        },
        { _id: false }
      ),
      required: true,
    },

    // â”€â”€ questions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    questions: { type: [QuestionSchema], required: true, default: [] },

    // â”€â”€ flashcards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    flashcards: { type: [FlashcardSchema], required: true, default: [] },

    // â”€â”€ schedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    schedule: {
      type: new Schema(
        {
          days_available: { type: Number, required: true, default: 1 },
          days:           { type: [DayEntrySchema], required: true, default: [] },
        },
        { _id: false }
      ),
      required: true,
    },

    // â”€â”€ coverage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    coverage: {
      type: new Schema(
        {
          uncovered_requirement_ids: { type: [String], required: true, default: [] },
          passes:                    { type: Number, required: true, default: 0 },
        },
        { _id: false }
      ),
      required: true,
    },

    // â”€â”€ backend-specific fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /** Owner's ObjectId â€” all kit routes verify this matches the authenticated user. */
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    /**
     * Lifecycle state of the kit.
     * - pending    â€” created, pipeline not yet started
     * - generating â€” pipeline is actively running
     * - ready      â€” pipeline completed successfully
     * - failed     â€” pipeline encountered an unrecoverable error
     */
    status: {
      type: String,
      required: true,
      enum: ['pending', 'generating', 'ready', 'failed'],
      default: 'pending',
    },

    /**
     * Stores the last pipeline error message when status === 'failed'.
     * Absent (undefined) in all other states.
     */
    pipelineError: {
      type: String,
    },

    /**
     * Deduplication fingerprint:
     *   sha256(normalise(jobDescription) + '|' + normalise(companyUrl))
     * where normalise = lowercase + trim whitespace.
     * Compound-unique indexed on (userId, dedupeKey).
     */
    dedupeKey: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // manages createdAt and updatedAt
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

/** Speed up listing all kits for a given user. */
KitSchema.index({ userId: 1 });

/** Prevent duplicate kits (same JD + company URL) per user. */
KitSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default model<KitModelDocument>('Kit', KitSchema);

