'use client';

/**
 * ProgressBar — shows how many cards have been rated in the current session.
 *
 * Requirement 15.4: displays count of cards rated so far and total deck size.
 */

export interface ProgressBarProps {
  /** Number of cards rated so far this session. */
  rated: number;
  /** Total cards in the deck. */
  total: number;
}

export function ProgressBar({ rated, total }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((rated / total) * 100) : 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-1.5">
      {/* Label row */}
      <div className="flex items-center justify-between text-xs text-text-secondary font-sans">
        <span>
          {rated} of {total} rated
        </span>
        <span aria-hidden="true">{percentage}%</span>
      </div>

      {/* Track */}
      <div
        role="progressbar"
        aria-valuenow={rated}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${rated} of ${total} cards rated`}
        className="h-1.5 w-full bg-bg-raised rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
