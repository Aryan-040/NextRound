'use client';

/**
 * Create Kit page — /create
 *
 * Two modes:
 *   - 'single': Single kit creation with form
 *   - 'batch': Multiple kits from CSV/JSON upload
 *
 * Single mode phases:
 *   'form'     — Show CreateForm. On successful POST → switch to 'progress'.
 *   'progress' — Show ProgressTracker (SSE). On completion → redirect to kit.
 *
 * Batch mode:
 *   Shows BatchUpload component that handles file parsing and multiple kit creation
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

  // Open SSE stream only when in single mode's 'progress' phase.
  const activeKitId = mode === 'single' && singlePhase === 'progress' ? kitId : null;
  const { stages, status, error } = useSSEProgress(activeKitId);

  // Redirect to the kit builder when pipeline finishes (single mode).
  useEffect(() => {
    if (mode === 'single' && status === 'complete' && kitId) {
      const timer = setTimeout(() => {
        router.push(`/kits/${kitId}`);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [mode, status, kitId, router]);

  const handleKitCreated = (newKitId: string) => {
    setKitId(newKitId);
    setSinglePhase('progress');
  };

  const handleBatchComplete = () => {
    // After batch completes, redirect to dashboard
    router.push('/dashboard');
  };

  return (
    <div className="max-w-[680px]">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="font-sans font-bold text-2xl text-text-primary tracking-tight mb-1">
          New prep kit
        </h1>
        <p className="text-sm text-text-secondary">
          Create a single kit or upload multiple job descriptions at once.
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 mb-6 p-1 bg-bg-raised rounded-lg">
        <button
          onClick={() => {
            setMode('single');
            setSinglePhase('form');
            setKitId(null);
          }}
          className={[
            'flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150',
            mode === 'single'
              ? 'bg-bg-surface text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          ].join(' ')}
        >
          Single Kit
        </button>
        <button
          onClick={() => setMode('batch')}
          className={[
            'flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150',
            mode === 'batch'
              ? 'bg-bg-surface text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          ].join(' ')}
        >
          Batch Upload
        </button>
      </div>

      {/* Single kit creation flow */}
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
      {mode === 'batch' && (
        <BatchUpload onComplete={handleBatchComplete} />
      )}
    </div>
  );
}

