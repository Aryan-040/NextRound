/**
 * Re-exports all shared types from @interview-prep/shared.
 *
 * Frontend components should import types from here rather than directly
 * from the shared package, keeping the import path short and consistent:
 *
 *   import type { Kit, Question } from '@/types';
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
  FieldError,
  ValidationError,
} from '@interview-prep/shared';

export { validateKit, isValidationError, serialiseKit } from '@interview-prep/shared';
