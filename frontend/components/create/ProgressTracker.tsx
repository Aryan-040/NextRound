'use client';

/**
 * ProgressTracker — displays pipeline stage progress during kit generation.
 *
 * Shows a StageList: each stage row has a visual state indicator:
 *   pending  — grey dot (not yet reached)
 *   running  — animated spinner (in progress)
 *   done     — green ✓ (completed successfully)
 *   failed   — red ✗ (this stage failed)
 *
 * Requirement 2.5: display a progress indicator listing each named pipeline
 * stage and updating the visual state of each stage label as it completes or
 * fails.
 */
import { Spinner } from '@/components/ui';
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  type StageEvent,
  type StageStatus,
} from '@/lib/sse';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProgressTrackerProps {
  stages: Record<string, StageEvent>;
  pipelineStatus: 'idle' | 'running' | 'complete' | 'failed';
  error: string | null;
}

// ─── Stage row icon ───────────────────────────────────────────────────────────

function StageIcon({ status }: { status: StageStatus | 'pending' }) {
  switch (status) {
    case 'running':
      return <Spinner size="sm" label="Running…" />;

    case 'done':
      return (
        <svg
          className="h-4 w-4 text-success shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
            clipRule="evenodd"
          />
        </svg>
      );

    case 'failed':
      return (
        <svg
          className="h-4 w-4 text-danger shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      );

    default: // pending
      return (
        <span className="h-4 w-4 flex items-center justify-center shrink-0" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-bg-raised border border-bg-surface" />
        </span>
      );
  }
}

// ─── Stage row ────────────────────────────────────────────────────────────────

interface StageRowProps {
  stageName: string;
  event: StageEvent | undefined;
}

function StageRow({ stageName, event }: StageRowProps) {
  const status: StageStatus | 'pending' = event?.status ?? 'pending';
  const label = STAGE_LABELS[stageName] ?? stageName;

  return (
    <li className="flex items-center gap-3 py-1.5">
      <StageIcon status={status} />
      <span
        className={[
          'text-sm font-sans',
          status === 'done'    ? 'text-text-primary'    : '',
          status === 'running' ? 'text-accent font-medium' : '',
          status === 'failed'  ? 'text-danger'          : '',
          status === 'pending' ? 'text-text-secondary'      : '',
        ].filter(Boolean).join(' ')}
      >
        {label}
      </span>
    </li>
  );
}

// ─── ProgressTracker ─────────────────────────────────────────────────────────

export function ProgressTracker({
  stages,
  pipelineStatus,
  error,
}: ProgressTrackerProps) {
  return (
    <div
      className="rounded-lg bg-bg-surface border border-bg-raised p-6"
      role="region"
      aria-label="Pipeline progress"
      aria-live="polite"
      aria-busy={pipelineStatus === 'running'}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        {pipelineStatus === 'running' && (
          <Spinner size="sm" label="Generating kit…" />
        )}
        {pipelineStatus === 'complete' && (
          <svg className="h-5 w-5 text-success shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
          </svg>
        )}
        {pipelineStatus === 'failed' && (
          <svg className="h-5 w-5 text-danger shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        )}
        <h2 className="font-sans text-sm font-semibold text-text-primary">
          {pipelineStatus === 'running'  && 'Generating your prep kit…'}
          {pipelineStatus === 'complete' && 'Kit ready — redirecting…'}
          {pipelineStatus === 'failed'   && 'Generation failed'}
          {pipelineStatus === 'idle'     && 'Starting…'}
        </h2>
      </div>

      {/* Stage list */}
      <ul className="space-y-0.5" aria-label="Pipeline stages">
        {PIPELINE_STAGES.map((stageName) => (
          <StageRow
            key={stageName}
            stageName={stageName}
            event={stages[stageName]}
          />
        ))}
      </ul>

      {/* Top-level error message */}
      {error && (
        <p
          role="alert"
          className="mt-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2"
        >
          {error}
        </p>
      )}
    </div>
  );
}
