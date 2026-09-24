'use client';

/**
 * Create Kit page — /create
 *
 * Supports two modes:
 *   'single' — Create one kit with form input
 *   'batch'  — Upload JSON file with multiple job descriptions
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
import { BatchUpload } from '@/components/create/BatchUpload';
import { useSSEProgress } from '@/lib/sse';

type Mode = 'single' | 'batch';
type SinglePhase = 'form' | 'progress';

export default function CreatePage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('single');
  const [singlePhase, setSinglePhase] = useState<SinglePhase>('form');
  const [kitId, setKitId] = useState<string | null>(null);

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
          {mode === 'single' 
            ? 'Paste a job description and company URL to generate your personalized interview prep kit.'
            : 'Upload a JSON file with multiple job descriptions to create several kits at once.'
          }
        </p>
      </div>

      {/* Mode toggle */}
      <div className="mb-6 inline-flex items-center gap-1 p-1 rounded-lg bg-bg-raised">
        <button
          onClick={() => setMode('single')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
            mode === 'single'
              ? 'bg-bg-base text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Single Kit
        </button>
        <button
          onClick={() => setMode('batch')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
            mode === 'batch'
              ? 'bg-bg-base text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Batch Upload
        </button>
      </div>

      {/* Single-kit creation flow */}
      {mode === 'single' && (
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
      )}

      {/* Batch upload flow */}
      {mode === 'batch' && <BatchUpload />}
    </div>
  );
}

