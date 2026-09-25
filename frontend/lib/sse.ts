'use client';

/**
 * useSSEProgress â€” Server-Sent Events hook for pipeline progress.
 *
 * EventSource does not support custom headers, so the JWT is passed as a
 * `?token=â€¦` query parameter. The backend reads it from `req.query.token`.
 *
 * Returns:
 *   stages  â€” Record<stageName, StageEvent>: latest event per stage
 *   status  â€” overall session state: idle | running | complete | failed
 *   error   â€” top-level error message, or null
 *
 * Requirement 2.5 â€” show pipeline progress per named stage.
 */
import { useEffect, useRef, useState } from 'react';
import { getToken } from './auth';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** All valid stage names emitted by the backend SSE stream. */
export type PipelineStage =
  | 'crawl'
  | 'research'
  | 'extract-requirements'
  | 'company-brief'
  | 'generate-questions-technical'
  | 'generate-questions-behavioural'
  | 'generate-questions-system-design'
  | 'generate-questions-company-fit'
  | 'generate-flashcards'
  | 'coverage-check'
  | 'gap-fill'
  | 'schedule'
  | 'complete'
  | 'failed'
  | 'pipeline';

export type StageStatus = 'pending' | 'running' | 'done' | 'failed';

export interface StageEvent {
  stage: PipelineStage;
  status: StageStatus;
  message?: string;
  error?: string;
  completedAt?: string;
}

export type ProgressStatus = 'idle' | 'running' | 'complete' | 'failed';

export interface SSEProgressState {
  stages: Record<string, StageEvent>;
  status: ProgressStatus;
  error: string | null;
}

// â”€â”€â”€ Ordered stage list for display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * The canonical order of pipeline stages shown in the UI.
 * Excludes the synthetic `complete` / `failed` terminal stages â€” those
 * drive the overall `status` only.
 */
export const PIPELINE_STAGES: PipelineStage[] = [
  'crawl',
  'research',
  'extract-requirements',
  'company-brief',
  'generate-questions-technical',
  'generate-questions-behavioural',
  'generate-questions-system-design',
  'generate-questions-company-fit',
  'generate-flashcards',
  'coverage-check',
  'gap-fill',
  'schedule',
];

/** Human-readable labels for each stage. */
export const STAGE_LABELS: Record<string, string> = {
  'crawl':                            'Crawling company site',
  'research':                         'Researching interview process',
  'extract-requirements':             'Extracting requirements',
  'company-brief':                    'Generating company brief',
  'generate-questions-technical':     'Generating technical questions',
  'generate-questions-behavioural':   'Generating behavioural questions',
  'generate-questions-system-design': 'Generating system design questions',
  'generate-questions-company-fit':   'Generating company-fit questions',
  'generate-flashcards':              'Building flashcards',
  'coverage-check':                   'Checking coverage',
  'gap-fill':                         'Filling coverage gaps',
  'schedule':                         'Scheduling study plan',
};

// â”€â”€â”€ Hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Opens an SSE connection to `/api/kits/:id/progress` and tracks stage events.
 *
 * @param kitId â€” Kit ID to listen on; pass `null` to stay idle.
 */
export function useSSEProgress(kitId: string | null): SSEProgressState {
  const [stages, setStages] = useState<Record<string, StageEvent>>({});
  const [status, setStatus] = useState<ProgressStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Keep a ref to the EventSource so we can close it on cleanup.
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!kitId || kitId === 'undefined' || kitId.trim() === '') {
      // Reset to idle when no kit is selected or kitId is invalid.
      setStages({});
      setStatus('idle');
      setError(null);
      return;
    }

    const token = getToken();
    
    // Build the progress endpoint URL.
    // If API_BASE is relative (e.g., '/api'), we need to create an absolute URL
    // by prepending the current origin in the browser.
    let progressUrl: string;
    if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
      // API_BASE is already absolute
      progressUrl = `${API_BASE}/kits/${encodeURIComponent(kitId)}/progress`;
    } else {
      // API_BASE is relative (e.g., '/api'), make it absolute
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      progressUrl = `${origin}${API_BASE}/kits/${encodeURIComponent(kitId)}/progress`;
    }
    
    const url = new URL(progressUrl);
    if (token) {
      url.searchParams.set('token', token);
    }

    const es = new EventSource(url.toString());
    esRef.current = es;

    setStatus('running');
    setStages({});
    setError(null);

    es.onmessage = (event: MessageEvent<string>) => {
      let parsed: StageEvent;
      try {
        parsed = JSON.parse(event.data) as StageEvent;
      } catch {
        // Ignore unparseable frames.
        return;
      }

      const { stage, status: stageStatus } = parsed;

      // Terminal stages drive the overall session status.
      // The backend emits stage:'pipeline' as the terminal event.
      if (stage === 'pipeline' || stage === 'complete') {
        if (stageStatus === 'done') {
          setStatus('complete');
          es.close();
          return;
        }
        if (stageStatus === 'failed') {
          setStatus('failed');
          setError((parsed as any).error ?? parsed.message ?? 'Pipeline failed.');
          es.close();
          return;
        }
        // 'running' pipeline event — ignore, not a terminal state
        return;
      }
      if (stage === 'failed') {
        setStatus('failed');
        setError(parsed.message ?? 'Pipeline failed.');
        es.close();
        return;
      }

      // Update the per-stage record.
      setStages((prev) => ({ ...prev, [stage]: parsed }));
    };

    es.onerror = () => {
      setStatus('failed');
      setError('Connection to server lost. Please refresh and try again.');
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [kitId]);

  return { stages, status, error };
}


