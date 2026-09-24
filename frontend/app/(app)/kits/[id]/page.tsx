'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import type { KitDocument, Question, Flashcard } from '@/types';
import { Spinner } from '@/components/ui/Spinner';
import { KitProgressOverlay } from '@/components/builder/KitProgressOverlay';
import { CompanyBriefSection } from '@/components/builder/CompanyBriefSection';
import { QuestionsSection } from '@/components/builder/QuestionsSection';
import { FlashcardsSection } from '@/components/builder/FlashcardsSection';
import { ScheduleSection } from '@/components/builder/ScheduleSection';
import { KitStatsBar } from '@/components/builder/KitStatsBar';
import { RequirementsPanel } from '@/components/builder/RequirementsPanel';
import { getToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/** True when the kit is doing its INITIAL generation (not a section regen).
 *  A kit with existing content that is stuck in 'generating' (e.g. server
 *  restarted mid-regen) is treated as ready so the overlay never blocks the UI.
 */
function isInitialGeneration(kit: KitDocument): boolean {
  if (kit.status === 'pending') return true;
  if (kit.status !== 'generating') return false;
  // 'generating' is only a true initial generation if the kit has no content yet.
  const hasContent = !!kit.company_brief?.summary || (kit.questions?.length ?? 0) > 0;
  return !hasContent;
}

type RegenSectionKey = 'company-brief' | 'questions' | 'flashcards' | 'schedule';

export default function KitPage() {
  const params = useParams();
  const kitId = params?.id as string;

  const [kit, setKit]               = useState<KitDocument | null>(null);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // showFullOverlay is ONLY true for the initial kit generation, never for section regen.
  const [showFullOverlay, setShowFullOverlay] = useState(false);

  // Which section key is currently regenerating (null = none).
  const [regenSection, setRegenSection] = useState<RegenSectionKey | null>(null);

  // SSE connection used during section regen — kept in a ref so we can close it.
  const regenEsRef = useRef<EventSource | null>(null);

  const fetchKit = useCallback(async (silent = false) => {
    if (!kitId) return;
    if (!silent) { setLoading(true); setFetchError(null); }
    try {
      const data = await apiFetch<KitDocument>(`/kits/${kitId}`);
      setKit(data);
      // Only show the full overlay on initial load, never during/after section regen.
      if (!silent) {
        setShowFullOverlay(isInitialGeneration(data));
      }
    } catch (err) {
      if (!silent) {
        setFetchError(err instanceof ApiError ? err.message : 'Failed to load kit. Please refresh the page.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [kitId]);

  useEffect(() => { fetchKit(false); }, [fetchKit]);

  // Cleanup SSE on unmount
  useEffect(() => { return () => { regenEsRef.current?.close(); }; }, []);

  const handleFullOverlayComplete = useCallback(() => {
    setShowFullOverlay(false);
    fetchKit(false);
  }, [fetchKit]);

  /**
   * Called by a section's RegenerateButton BEFORE firing the POST request.
   * Opens a targeted SSE listener — waits for pipeline:done/failed, then does
   * a silent refresh so fetchKit doesn't flip showFullOverlay back on.
   */
  const handleRegenerateStart = useCallback((sectionKey: RegenSectionKey) => {
    regenEsRef.current?.close();
    setRegenSection(sectionKey);

    const token = getToken();
    const url = new URL(`${API_BASE}/kits/${kitId}/progress`);
    if (token) url.searchParams.set('token', token);

    const es = new EventSource(url.toString());
    regenEsRef.current = es;

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as { stage: string; status: string };
        if (parsed.stage === 'pipeline' &&
            (parsed.status === 'done' || parsed.status === 'failed')) {
          es.close();
          regenEsRef.current = null;
          setRegenSection(null);
          fetchKit(true); // silent refresh — do NOT touch showFullOverlay
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      es.close();
      regenEsRef.current = null;
      setRegenSection(null);
      fetchKit(true);
    };
  }, [kitId, fetchKit]);

  const handleBriefUpdate = useCallback((updated: { summary: string; what_they_do: string }) => {
    setKit(prev => prev ? { ...prev, company_brief: { ...prev.company_brief, ...updated } } : prev);
  }, []);

  const handleQuestionsUpdate = useCallback((updatedQuestions: Question[]) => {
    setKit(prev => prev ? { ...prev, questions: updatedQuestions } : prev);
  }, []);

  const handleFlashcardsUpdate = useCallback((updatedFlashcards: Flashcard[]) => {
    setKit(prev => prev ? { ...prev, flashcards: updatedFlashcards } : prev);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]" aria-label="Loading kit">
      <Spinner size="lg" label="Loading kit..." />
    </div>
  );

  if (fetchError) return (
    <div role="alert" className="mt-12 text-center space-y-3">
      <p className="text-danger text-sm">{fetchError}</p>
      <button type="button" onClick={() => fetchKit(false)}
        className="text-accent text-sm underline hover:no-underline hover:text-[#7AAAF4] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        Try again
      </button>
    </div>
  );

  if (!kit) return null;
  const { status, source, company_brief } = kit;

  return (
    <>
      {/* Full pipeline overlay — initial kit generation ONLY */}
      {showFullOverlay && (
        <KitProgressOverlay kitId={kitId} onComplete={handleFullOverlayComplete} />
      )}

      <div className="space-y-6 pb-16">
        <header className="space-y-5 pb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-sans text-2xl font-bold text-text-primary">
                {source.role || 'Interview Prep Kit'}
              </h1>
              <p className="text-text-secondary text-sm mt-1.5">
                {source.company}
                {source.company_url && (
                  <>
                    {' · '}
                    <a href={source.company_url} target="_blank" rel="noopener noreferrer"
                      className="text-accent hover:text-[#7AAAF4] transition-colors">
                      {source.company_url}
                    </a>
                  </>
                )}
              </p>
            </div>
            {/* Practice mode entry point — only show when kit has flashcards */}
            {(kit.flashcards?.length ?? 0) > 0 && (status === 'ready' || status === 'failed') && (
              <Link
                href={`/kits/${kitId}/practice`}
                className={[
                  'shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium font-sans',
                  'bg-accent text-white hover:bg-accent/90 active:bg-accent/80',
                  'transition-colors duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
                ].join(' ')}
                aria-label={`Practice flashcards for this kit (${kit.flashcards?.length} cards)`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.963 8.963 0 00-4.25 1.065V16.82zM9.25 4.065A8.963 8.963 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11a.75.75 0 00.954.721A7.506 7.506 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.065z" />
                </svg>
                Practice
              </Link>
            )}
          </div>
          {(status === 'ready' || status === 'failed') && <KitStatsBar kit={kit} />}
        </header>

        {status === 'failed' && (
          <div role="alert" className="bg-danger/10 border border-danger/20 rounded-lg px-4 py-3 text-sm text-danger">
            Kit generation failed{kit.pipelineError && `: ${kit.pipelineError}`}. Some sections may be incomplete.
          </div>
        )}

        {/* Builder sections — isRegenerating scopes the loading state to each card */}
        {(status === 'ready' || status === 'failed' || status === 'generating') && company_brief && (
          <>
            {/* Requirements & Coverage panel — collapsed by default, always visible */}
            {(kit.role?.requirements?.length ?? 0) > 0 && (
              <RequirementsPanel
                requirements={kit.role.requirements}
                uncoveredRequirementIds={kit.coverage?.uncovered_requirement_ids ?? []}
                coveragePasses={kit.coverage?.passes ?? 0}
              />
            )}

            <CompanyBriefSection
              kitId={kitId}
              brief={company_brief}
              onUpdate={handleBriefUpdate}
              isRegenerating={regenSection === 'company-brief'}
              onRegenerateStart={() => handleRegenerateStart('company-brief')}
            />
            <QuestionsSection
              kitId={kitId}
              questions={kit.questions ?? []}
              onUpdate={handleQuestionsUpdate}
              isRegenerating={regenSection === 'questions'}
              onRegenerateStart={() => handleRegenerateStart('questions')}
            />
            <FlashcardsSection
              kitId={kitId}
              flashcards={kit.flashcards ?? []}
              onUpdate={handleFlashcardsUpdate}
              isRegenerating={regenSection === 'flashcards'}
              onRegenerateStart={() => handleRegenerateStart('flashcards')}
            />
            {kit.schedule && (
              <ScheduleSection
                kitId={kitId}
                schedule={kit.schedule}
                questions={kit.questions ?? []}
                isRegenerating={regenSection === 'schedule'}
                onRegenerateStart={() => handleRegenerateStart('schedule')}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}