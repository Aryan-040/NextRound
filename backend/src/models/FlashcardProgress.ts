/**
 * FlashcardProgress.ts
 * Mongoose model for per-flashcard practice progress.
 *
 * Stub created for task 10.3 (DELETE kit needs to purge these records).
 * Full implementation is in task 11.1.
 *
 * Indexes:
 *   { userId: 1, kitId: 1, flashcardId: 1 }  — unique, primary lookup
 *   { userId: 1, kitId: 1, meanConfidence: 1 } — deck ordering query
 */

import { Schema, model, Document, Types } from 'mongoose';
import type { FlashcardProgressDocument, RatingEntry } from '../shared';

// ---------------------------------------------------------------------------
// FlashcardProgressModelDocument
// ---------------------------------------------------------------------------

export interface FlashcardProgressModelDocument
  extends Omit<FlashcardProgressDocument, '_id' | 'userId' | 'kitId'>,
    Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kitId: Types.ObjectId;
}

// ---------------------------------------------------------------------------
// Sub-schema
// ---------------------------------------------------------------------------

const RatingEntrySchema = new Schema<RatingEntry>(
  {
    confidence: { type: Number, required: true, enum: [1, 2, 3, 4] },
    ratedAt:    { type: Date,   required: true },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Root schema
// ---------------------------------------------------------------------------

const FlashcardProgressSchema = new Schema<FlashcardProgressModelDocument>(
  {
    userId:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kitId:          { type: Schema.Types.ObjectId, ref: 'Kit',  required: true },
    flashcardId:    { type: String, required: true },
    ratings:        { type: [RatingEntrySchema], required: true, default: [] },
    meanConfidence: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

FlashcardProgressSchema.index(
  { userId: 1, kitId: 1, flashcardId: 1 },
  { unique: true }
);
FlashcardProgressSchema.index({ userId: 1, kitId: 1, meanConfidence: 1 });

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default model<FlashcardProgressModelDocument>(
  'FlashcardProgress',
  FlashcardProgressSchema
);
