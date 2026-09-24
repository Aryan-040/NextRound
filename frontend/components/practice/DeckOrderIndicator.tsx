'use client';

/**
 * DeckOrderIndicator — shows the current card position within the deck and
 * whether the card has been rated before ("covered") or is unseen.
 *
 * Requirement 15.7: each card shows whether it has been rated at least once
 *                   ("covered") or never rated ("not seen").
 */
import { Badge } from '@/components/ui';

export interface DeckOrderIndicatorProps {
  /** 0-based index of the current card. */
  currentIndex: number;
  /** Total number of cards in the deck. */
  total: number;
  /**
   * Set of flashcard IDs that have been rated at least once.
   * Used to determine the "covered" vs "not seen" badge.
   */
  coveredIds: Set<string>;
  /** The ID of the current flashcard being displayed. */
  currentFlashcardId: string;
}

export function DeckOrderIndicator({
  currentIndex,
  total,
  coveredIds,
  currentFlashcardId,
}: DeckOrderIndicatorProps) {
  const isCovered = coveredIds.has(currentFlashcardId);
  const position = currentIndex + 1; // 1-based for display

  return (
    <div
      className="flex items-center justify-between w-full max-w-2xl mx-auto"
      aria-label={`Card ${position} of ${total}`}
    >
      {/* Card position */}
      <p className="text-sm text-text-secondary font-sans">
        <span className="font-medium text-text-primary">{position}</span>
        <span className="mx-1">/</span>
        <span>{total}</span>
      </p>

      {/* Coverage badge */}
      <Badge
        variant={isCovered ? 'success' : 'muted'}
        aria-label={isCovered ? 'Previously rated' : 'Not seen yet'}
      >
        {isCovered ? 'covered' : 'not seen'}
      </Badge>
    </div>
  );
}
