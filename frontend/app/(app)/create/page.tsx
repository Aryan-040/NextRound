'use client';

/**
 * Create Kit page — /create
 *
 * Single-kit creation flow with two phases:
 *   'form'     — Show CreateForm. On successful POST → switch to 'progress'.
 *   'progress' — Show ProgressTracker (SSE). On completion → redirect to kit.
 *
 * Requirement 2.5: progress indicator with named pipeline stages.
 * Requirement 2.6: duplicate kit modal handled inside CreateForm.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CreateForm } from '@/components/create/CreateForm';
import { ProgressTracker } from '@/components/create/ProgressTracker';
import { useSSEProgress } from '@/lib/sse';

type SinglePhase = 'form' | 'progress';

export default function CreatePage() {
  const router = useRouter();

  const [singlePhase, setSinglePhase] = useState<SinglePhase>('form');
  const [kitId, setKitId]             = useState<string | null>(null);

  // Open SSE stream only when in the 'progress' phase.
  const activeKitId = singlePhase === 'progress' ? kitId : null;
  const { stages, status, error } = useSSEProgress(activeKitId);

  // Redirect to the kit builder when pipeline finishes.
  useEffect(() => {
    if (status === 'complete' && kitId) {
      const timer = setTimeout(() => {
        router.push(`/kits/${kitId}`);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [status, kitId, router]);

  const handleKitCreated = (newKitId: string) => {
    setKitId(newKitId);
    setSinglePhase('progress');
  };

  return (
    <div className="max-w-[680px]">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="font-sans font-bold text-2xl text-text-primary tracking-tight mb-1">
          New prep kit
        </h1>
        <p className="text-sm text-text-secondary">
          Paste a job description and company URL to generate your personalized interview prep kit.
        </p>
      </div>

      {/* Single-kit creation flow */}
      <div>
        {singlePhase === 'form' && (
          <CreateForm onKitCreated={handleKitCreated} />
        )}
        {singlePhase === 'progress' && (
          <ProgressTracker
            stages={stages}
            pipelineStatus={status}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

