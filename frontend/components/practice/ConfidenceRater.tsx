'use client';

/**
 * ConfidenceRater — four confidence rating buttons shown after a flashcard is
 * revealed.
 *
 * Requirement 15.2: buttons labelled "Again" (1), "Hard" (2), "Good" (3),
 *                   "Easy" (4); displayed after reveal.
 * Requirement 15.3: on click, records confidence + timestamp via POST /rate,
 *                   then advances to the next card or goes to SESSION_SUMMARY.
 */
import { useState } from 'react';
import { Button } from '@/components/ui';

export type ConfidenceValue = 1 | 2 | 3 | 4;

export interface ConfidenceRaterProps {
  flashcardId: string;
  /** Called after a successful POST /rate. Receives the confidence value. */
  onRate: (confidence: ConfidenceValue) => Promise<void>;
}

interface RatingButton {
  label: string;
  value: ConfidenceValue;
  /** Tailwind colour classes for the button state */
  activeClass: string;
  ariaLabel: string;
}

const RATING_BUTTONS: RatingButton[] = [
  {
    label: 'Again',
    value: 1,
    activeClass:
      'border-danger text-danger hover:bg-danger hover:text-bg-base focus-visible:ring-danger',
    ariaLabel: 'Again — confidence 1',
  },
  {
    label: 'Hard',
    value: 2,
    activeClass:
      'border-warning text-warning hover:bg-warning hover:text-bg-base focus-visible:ring-warning',
    ariaLabel: 'Hard — confidence 2',
  },
  {
    label: 'Good',
    value: 3,
    activeClass:
      'border-accent text-accent hover:bg-accent hover:text-bg-base focus-visible:ring-accent',
    ariaLabel: 'Good — confidence 3',
  },
  {
    label: 'Easy',
    value: 4,
    activeClass:
      'border-success text-success hover:bg-success hover:text-bg-base focus-visible:ring-success',
    ariaLabel: 'Easy — confidence 4',
  },
];

export function ConfidenceRater({ flashcardId, onRate }: ConfidenceRaterProps) {
  const [submitting, setSubmitting] = useState<ConfidenceValue | null>(null);

  async function handleRate(value: ConfidenceValue) {
    if (submitting !== null) return; // prevent double-click
    setSubmitting(value);
    try {
      await onRate(value);
    } finally {
      // If the parent unmounts us after a successful rate, this may never run —
      // that's fine; no memory leak because we aren't using a ref here.
      setSubmitting(null);
    }
  }

  return (
    <div
      role="group"
      aria-label="Rate your confidence"
      className="flex items-center justify-center gap-3 flex-wrap"
    >
      <p className="w-full text-center text-xs text-text-secondary mb-1">
        How well did you know this?
      </p>
      {RATING_BUTTONS.map(({ label, value, activeClass, ariaLabel }) => (
        <button
          key={value}
          type="button"
          onClick={() => handleRate(value)}
          disabled={submitting !== null}
          aria-label={ariaLabel}
          aria-busy={submitting === value}
          className={[
            'inline-flex items-center justify-center gap-1.5',
            'min-w-[80px] px-4 py-2 rounded-md',
            'border text-sm font-medium font-sans',
            'transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
            'disabled:opacity-50 disabled:pointer-events-none',
            activeClass,
            // Dim unselected buttons while one is submitting
            submitting !== null && submitting !== value ? 'opacity-40' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {submitting === value ? (
            /* Inline micro-spinner */
            <svg
              className="animate-spin h-4 w-4 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          ) : null}
          {label}
        </button>
      ))}
    </div>
  );
}
