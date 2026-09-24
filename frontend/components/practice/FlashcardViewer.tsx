'use client';

/**
 * FlashcardViewer — shows the front face of a flashcard and reveals the back
 * when the user clicks "Reveal answer".
 *
 * Requirement 15.1: back face is hidden until user activates "Reveal answer".
 * Requirement 15.2: after reveal, back face is visible and ConfidenceRater
 *                   buttons are presented (rendered by the parent).
 */
import { Button } from '@/components/ui';
import type { Flashcard } from '@/types';

export interface FlashcardViewerProps {
  flashcard: Flashcard;
  /** Whether the back face is currently visible. */
  revealed: boolean;
  /** Called when the user clicks "Reveal answer". */
  onReveal: () => void;
}

export function FlashcardViewer({
  flashcard,
  revealed,
  onReveal,
}: FlashcardViewerProps) {
  return (
    <div
      className="bg-bg-surface border border-bg-raised rounded-lg p-8 space-y-6 w-full max-w-2xl mx-auto"
      role="article"
      aria-label="Flashcard"
    >
      {/* ── Front ──────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-text-secondary mb-3">
          Question
        </p>
        <p className="text-lg font-medium text-text-primary font-sans leading-relaxed">
          {flashcard.front}
        </p>
      </div>

      {/* ── Reveal button ──────────────────────────────────────────────────── */}
      {!revealed && (
        <Button
          variant="secondary"
          size="md"
          onClick={onReveal}
          className="w-full justify-center"
          aria-label="Reveal answer"
        >
          Reveal answer
        </Button>
      )}

      {/* ── Back ───────────────────────────────────────────────────────────── */}
      {revealed && (
        <div
          role="region"
          aria-label="Answer"
          className="pt-4 border-t border-bg-raised space-y-2 animate-fade-up"
        >
          <p className="text-xs font-medium text-text-secondary">
            Answer
          </p>
          <p className="text-base text-text-primary font-sans leading-relaxed whitespace-pre-wrap">
            {flashcard.back}
          </p>
        </div>
      )}
    </div>
  );
}
