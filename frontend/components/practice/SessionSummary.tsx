'use client';

/**
 * SessionSummary — shown when all flashcards in the session have been rated.
 *
 * Requirement 15.5: displays count per confidence level (1–4) and total.
 * Provides "Practice again" button to restart and "Back to kit" navigation link.
 */
import Link from 'next/link';
import { Button } from '@/components/ui';
import type { ConfidenceValue } from './ConfidenceRater';

export interface SessionSummaryProps {
  kitId: string;
  /** Map of confidence value → count of cards rated at that level. */
  counts: Record<ConfidenceValue, number>;
  /** Total cards rated this session. */
  total: number;
  /** Called when the user clicks "Practice again" — restarts the session. */
  onPracticeAgain: () => void;
}

interface ConfidenceBand {
  value: ConfidenceValue;
  label: string;
  colourClass: string;
  bgClass: string;
}

const BANDS: ConfidenceBand[] = [
  {
    value: 1,
    label: 'Again',
    colourClass: 'text-danger',
    bgClass: 'bg-danger/10 border-danger/20',
  },
  {
    value: 2,
    label: 'Hard',
    colourClass: 'text-warning',
    bgClass: 'bg-warning/10 border-warning/20',
  },
  {
    value: 3,
    label: 'Good',
    colourClass: 'text-accent',
    bgClass: 'bg-accent-dim/50 border-accent/20',
  },
  {
    value: 4,
    label: 'Easy',
    colourClass: 'text-success',
    bgClass: 'bg-success/10 border-success/20',
  },
];

export function SessionSummary({
  kitId,
  counts,
  total,
  onPracticeAgain,
}: SessionSummaryProps) {
  return (
    <div
      className="flex flex-col items-center gap-8 w-full max-w-lg mx-auto py-8 animate-fade-up"
      aria-live="polite"
    >
      {/* Heading */}
      <div className="text-center space-y-2">
        <h2 className="font-sans text-2xl font-bold text-text-primary">
          Session complete
        </h2>
        <p className="text-text-secondary text-sm">
          You rated {total} {total === 1 ? 'card' : 'cards'} this session.
        </p>
      </div>

      {/* Confidence breakdown grid */}
      <div
        className="grid grid-cols-2 gap-3 w-full"
        aria-label="Confidence breakdown"
      >
        {BANDS.map(({ value, label, colourClass, bgClass }) => (
          <div
            key={value}
            className={[
              'flex flex-col items-center justify-center rounded-lg border p-4 gap-1',
              bgClass,
            ].join(' ')}
          >
            <span
              className={['text-3xl font-bold font-sans', colourClass].join(
                ' '
              )}
            >
              {counts[value]}
            </span>
            <span className="text-xs text-text-secondary font-medium">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full">
        <Button
          variant="primary"
          size="lg"
          onClick={onPracticeAgain}
          className="w-full justify-center"
        >
          Practice again
        </Button>
        <Link
          href={`/kits/${kitId}`}
          className={[
            'inline-flex items-center justify-center w-full',
            'px-6 py-2.5 rounded-md text-base',
            'bg-transparent text-text-secondary border border-bg-raised',
            'hover:border-accent/50 hover:text-accent hover:bg-bg-raised transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
            'font-sans font-medium',
          ].join(' ')}
        >
          Back to kit
        </Link>
      </div>
    </div>
  );
}
