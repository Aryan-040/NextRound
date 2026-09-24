/**
 * Public API of the @interview-prep/shared package.
 *
 * Import types from here rather than from individual source files so that
 * internal module boundaries can change without breaking consumers.
 *
 * Usage:
 *   import type { Kit, Question, Flashcard } from '@interview-prep/shared';
 */

export type {
  Requirement,
  Question,
  Flashcard,
  DayEntry,
  Kit,
  KitDocument,
  RatingEntry,
  FlashcardProgressDocument,
} from './types';

export type { FieldError, ValidationError } from './validator';
export { validateKit, isValidationError } from './validator';

export { serialiseKit } from './serialiser';
