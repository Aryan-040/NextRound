/**
 * Re-exports all shared types for frontend components.
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
} from './shared/types';

export type { FieldError, ValidationError } from './shared/validator';
export { validateKit, isValidationError } from './shared/validator';
export { serialiseKit } from './shared/serialiser';
