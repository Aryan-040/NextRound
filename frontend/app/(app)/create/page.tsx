'use client';

/**
 * Create Kit page — /create
 *
 * Two tabs at the top let the user switch between:
 *   "Single kit"  — CreateForm (Req 2.x)
 *   "Batch upload" — BatchUpload (Req 3.x)
 *
 * Within the single-kit tab, there are two phases:
 *   'form'     — Show CreateForm. On successful POST → switch to 'progress'.
 *   'progress' — Show ProgressTracker (SSE). On completion → redirect to kit.
 *
 * Requirement 2.5: progress indicator with named pipeline stages.
 * Requirement 2.6: duplicate kit modal handled inside CreateForm.
 * Requirement 3.1–3.5: batch upload handled by BatchUpload.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CreateForm } from '@/components/create/CreateForm';
import { ProgressTracker } from '@/components/create/ProgressTracker';
import { BatchUpload } from '@/components/create/BatchUpload';
import { useSSEProgress } from '@/lib/sse';

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'single' | 'batch';

const TABS: { id: TabId; label: string }[] = [
  { id: 'single', label: 'Single kit' },
  { id: 'batch',  label: 'Batch upload' },
];

// ─── Single-kit phase ─────────────────────────────────────────────────────────

type SinglePhase = 'form' | 'progress';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const router = useRouter();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('single');

  // Single-kit phase
  const [singlePhase, setSinglePhase] = useState<SinglePhase>('form');
  const [kitId, setKitId]             = useState<string | null>(null);

  // Open SSE stream only when in the 'progress' phase of the single-kit tab.
  const activeKitId =
    activeTab === 'single' && singlePhase === 'progress' ? kitId : null;
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

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleKitCreated = (newKitId: string) => {
    setKitId(newKitId);
    setSinglePhase('progress');
  };

  const handleTabChange = (tab: TabId) => {
    // Switching away from single while in progress would abandon the run;
    // only allow tab switching when in the form phase or after completion.
    if (activeTab === 'single' && singlePhase === 'progress') return;
    setActiveTab(tab);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[680px]">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="font-sans font-bold text-2xl text-text-primary tracking-tight mb-1">
          New prep kit
        </h1>
        <p className="text-sm text-text-secondary">
          Paste a job description and company URL, or upload a JSON file of
          multiple cases to generate several kits at once.
        </p>
      </div>

      {/* Tab bar — hidden while single-kit pipeline is running (no switching) */}
      {!(activeTab === 'single' && singlePhase === 'progress') && (
        <div
          role="tablist"
          aria-label="Kit creation mode"
          className="flex gap-1 mb-6 border-b border-border-default"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={activeTab === id}
              aria-controls={`tabpanel-${id}`}
              onClick={() => handleTabChange(id)}
              className={[
                'px-4 py-2 text-sm font-medium rounded-t transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
                activeTab === id
                  ? 'text-text-primary border-b-2 border-accent -mb-px'
                  : 'text-text-secondary hover:text-text-primary',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Single-kit tab ─────────────────────────────────────────────────── */}
      <div
        role="tabpanel"
        id="tabpanel-single"
        aria-labelledby="tab-single"
        hidden={activeTab !== 'single'}
      >
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

      {/* ── Batch-upload tab ───────────────────────────────────────────────── */}
      <div
        role="tabpanel"
        id="tabpanel-batch"
        aria-labelledby="tab-batch"
        hidden={activeTab !== 'batch'}
      >
        <BatchUpload />
      </div>
    </div>
  );
}
