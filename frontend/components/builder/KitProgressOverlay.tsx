'use client';

/**
 * KitProgressOverlay — full-screen overlay shown while a kit is being generated.
 *
 * Opens an SSE connection to /api/kits/:id/progress via useSSEProgress and
 * renders the ProgressTracker component. When the SSE stream signals
 * 'complete', calls onComplete so the parent can refresh the kit data.
 *
 * Requirements: 2.5, 14.4
 */
import { useEffect } from 'react';
import { ProgressTracker } from '@/components/create/ProgressTracker';
import { useSSEProgress } from '@/lib/sse';

export interface KitProgressOverlayProps {
  kitId: string;
  /** Called when the pipeline reaches 'complete' status. */
  onComplete: () => void;
}

/**
 * Full-screen centred overlay that shows pipeline progress while a kit is
 * being generated (status === 'generating' | 'pending').
 */
export function KitProgressOverlay({
  kitId,
  onComplete,
}: KitProgressOverlayProps) {
  const { stages, status, error } = useSSEProgress(kitId);

  // When SSE signals completion, notify the parent to re-fetch the kit.
  useEffect(() => {
    if (status === 'complete') {
      onComplete();
    }
  }, [status, onComplete]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg-base/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Kit generation in progress"
      aria-live="polite"
    >
      <div className="w-full max-w-md mx-4">
        <ProgressTracker
          stages={stages}
          pipelineStatus={status}
          error={error}
        />
      </div>
    </div>
  );
}
