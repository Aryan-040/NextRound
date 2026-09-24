'use client';

/**
 * PracticeMode — /kits/[id]/practice
 *
 * State machine:
 *   IDLE → LOADING_DECK → SHOWING_FRONT → SHOWING_BACK → SESSION_SUMMARY
 *                                                       ↘ EMPTY_DECK
 *                                                       ↘ DECK_ERROR
 *
 * Requirements: 15.1–15.8
 *
 * Data strategy:
 *   1. GET /api/kits/:id/practice/deck  → ordered flashcard ID array
 *   2. GET /api/kits/:id               → full kit (to resolve flashcard content)
 *   3. Combine: map deck order to Flashcard objects.
 *
 * Covered IDs (for the DeckOrderIndicator badge) come from the deck endpoint:
 * the backend returns cards with meanConfidence > 0 first; we treat those as
 * "covered". To know which IDs have been seen before we also request the full
 * progress info from the same deck endpoint.
 */
import { useCallback, useEffect, useReducer } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { apiFetch, ApiError } from '@/lib/api';
import type { Flashcard, KitDocument } from '@/types';

import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui';
import { FlashcardViewer } from '@/components/practice/FlashcardViewer';
import { ConfidenceRater } from '@/components/practice/ConfidenceRater';
import type { ConfidenceValue } from '@/components/practice/ConfidenceRater';
import { ProgressBar } from '@/components/practice/ProgressBar';
import { SessionSummary } from '@/components/practice/SessionSummary';
import { DeckOrderIndicator } from '@/components/practice/DeckOrderIndicator';

// ─── State machine types ──────────────────────────────────────────────────────

type PracticeState =
  | { phase: 'IDLE' }
  | { phase: 'LOADING_DECK' }
  | {
      phase: 'SHOWING_FRONT';
      deck: Flashcard[];
      coveredIds: Set<string>;
      currentIndex: number;
      ratings: Record<string, ConfidenceValue>; // flashcardId → confidence this session
    }
  | {
      phase: 'SHOWING_BACK';
      deck: Flashcard[];
      coveredIds: Set<string>;
      currentIndex: number;
      ratings: Record<string, ConfidenceValue>;
    }
  | {
      phase: 'SESSION_SUMMARY';
      counts: Record<ConfidenceValue, number>;
      total: number;
    }
  | { phase: 'EMPTY_DECK' }
  | { phase: 'DECK_ERROR'; message: string };

type PracticeAction =
  | { type: 'START_LOADING' }
  | {
      type: 'DECK_LOADED';
      deck: Flashcard[];
      coveredIds: Set<string>;
    }
  | { type: 'DECK_ERROR'; message: string }
  | { type: 'REVEAL' }
  | { type: 'RATE'; confidence: ConfidenceValue }
  | { type: 'RESTART' };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case 'START_LOADING':
      return { phase: 'LOADING_DECK' };

    case 'DECK_LOADED': {
      if (action.deck.length === 0) return { phase: 'EMPTY_DECK' };
      return {
        phase: 'SHOWING_FRONT',
        deck: action.deck,
        coveredIds: action.coveredIds,
        currentIndex: 0,
        ratings: {},
      };
    }

    case 'DECK_ERROR':
      return { phase: 'DECK_ERROR', message: action.message };

    case 'REVEAL': {
      if (
        state.phase !== 'SHOWING_FRONT'
      )
        return state;
      return {
        ...state,
        phase: 'SHOWING_BACK',
      };
    }

    case 'RATE': {
      if (state.phase !== 'SHOWING_BACK') return state;
      const { deck, currentIndex, ratings } = state;
      const current = deck[currentIndex];
      const newRatings = { ...ratings, [current.id]: action.confidence };

      const nextIndex = currentIndex + 1;

      if (nextIndex < deck.length) {
        // Advance to the next card
        return {
          ...state,
          phase: 'SHOWING_FRONT',
          currentIndex: nextIndex,
          ratings: newRatings,
        };
      }

      // All cards rated — build summary counts
      const counts: Record<ConfidenceValue, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const conf of Object.values(newRatings)) {
        counts[conf as ConfidenceValue]++;
      }
      return {
        phase: 'SESSION_SUMMARY',
        counts,
        total: deck.length,
      };
    }

    case 'RESTART':
      return { phase: 'LOADING_DECK' };

    default:
      return state;
  }
}

// ─── API helpers ──────────────────────────────────────────────────────────────

interface DeckResponse {
  /** Ordered array of flashcard IDs (ascending meanConfidence, unseen first). */
  deck: string[];
  /**
   * IDs that have at least one prior rating (meanConfidence > 0).
   * Used for the "seen before" badge in DeckOrderIndicator.
   */
  coveredIds: string[];
}

async function loadDeck(kitId: string): Promise<{
  deck: Flashcard[];
  coveredIds: Set<string>;
}> {
  // 1. Fetch ordered IDs + full kit in parallel.
  const [deckRes, kit] = await Promise.all([
    apiFetch<DeckResponse>(`/kits/${kitId}/practice/deck`),
    apiFetch<KitDocument>(`/kits/${kitId}`),
  ]);

  const { deck: order, coveredIds: coveredArr = [] } = deckRes;
  const flashcardMap = new Map(kit.flashcards.map((f) => [f.id, f]));

  // 2. Build the ordered deck (skip any IDs not found in the kit).
  const deck: Flashcard[] = [];
  for (const id of order) {
    const card = flashcardMap.get(id);
    if (card) deck.push(card);
  }

  return { deck, coveredIds: new Set(coveredArr) };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PracticePage() {
  const params = useParams();
  const kitId = params?.id as string;

  const [state, dispatch] = useReducer(reducer, { phase: 'IDLE' });

  // ── Fetch deck whenever phase transitions to LOADING_DECK ─────────────────

  const fetchDeck = useCallback(async () => {
    dispatch({ type: 'START_LOADING' });
    try {
      const { deck, coveredIds } = await loadDeck(kitId);
      dispatch({ type: 'DECK_LOADED', deck, coveredIds });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Failed to load the practice deck. Please try again.';
      dispatch({ type: 'DECK_ERROR', message });
    }
  }, [kitId]);

  // Kick off on mount (IDLE → LOADING_DECK)
  useEffect(() => {
    if (state.phase === 'IDLE') {
      fetchDeck();
    }
  }, [state.phase, fetchDeck]);

  // Re-fetch when the reducer transitions back to LOADING_DECK (restart)
  useEffect(() => {
    if (state.phase === 'LOADING_DECK') {
      // fetchDeck itself dispatches START_LOADING first, so guard against
      // the dispatch that gets us here recursively.
    }
  }, [state.phase]);

  // ── Rate handler (POST /practice/rate) ────────────────────────────────────

  const handleRate = useCallback(
    async (confidence: ConfidenceValue) => {
      if (state.phase !== 'SHOWING_BACK') return;
      const flashcardId = state.deck[state.currentIndex].id;

      // Fire-and-forget the POST; the reducer advances the state immediately
      // for snappy UX. Errors here are non-fatal — the session continues.
      try {
        await apiFetch(`/kits/${kitId}/practice/rate`, {
          method: 'POST',
          body: { flashcardId, confidence },
        });
      } catch {
        // Silently continue — confidence rating is best-effort.
      }

      dispatch({ type: 'RATE', confidence });
    },
    [kitId, state]
  );

  // ── Render helpers ─────────────────────────────────────────────────────────

  // Shared page chrome: back link + title
  function PageShell({ children }: { children: React.ReactNode }) {
    return (
      <div className="flex flex-col items-center gap-6 pb-16 w-full">
        {/* Top bar */}
        <div className="flex items-center justify-between w-full max-w-2xl mx-auto">
          <Link
            href={`/kits/${kitId}`}
            className="text-sm text-text-secondary hover:text-accent transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            ← Back to kit
          </Link>
          <h1 className="text-sm font-medium text-text-secondary font-sans">
            Practice Mode
          </h1>
        </div>
        {children}
      </div>
    );
  }

  // ── State renders ──────────────────────────────────────────────────────────

  if (state.phase === 'IDLE' || state.phase === 'LOADING_DECK') {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
          <Spinner size="lg" label="Loading practice deck…" />
          <p className="text-text-secondary text-sm">Loading your deck…</p>
        </div>
      </PageShell>
    );
  }

  if (state.phase === 'DECK_ERROR') {
    return (
      <PageShell>
        <div
          role="alert"
          className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center"
        >
          <p className="text-danger text-sm max-w-sm">{state.message}</p>
          <Button
            variant="secondary"
            size="md"
            onClick={() => dispatch({ type: 'RESTART' })}
          >
            Retry
          </Button>
        </div>
      </PageShell>
    );
  }

  if (state.phase === 'EMPTY_DECK') {
    return (
      <PageShell>
        {/* Requirement 15.8: empty-state message */}
        <div
          className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center"
          aria-live="polite"
        >
          <p className="text-lg font-medium text-text-primary">
            No flashcards to practise yet.
          </p>
          <p className="text-text-secondary text-sm max-w-sm">
            Flashcards will appear here once the kit has been generated. You can
            also add custom flashcards from the kit builder.
          </p>
          <Link
            href={`/kits/${kitId}`}
            className={[
              'inline-flex items-center justify-center',
              'px-4 py-2 rounded-md text-sm',
              'bg-bg-raised text-text-primary border border-bg-raised',
              'hover:border-accent hover:text-accent transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'font-sans font-medium mt-2',
            ].join(' ')}
          >
            Back to kit
          </Link>
        </div>
      </PageShell>
    );
  }

  if (state.phase === 'SESSION_SUMMARY') {
    return (
      <PageShell>
        <SessionSummary
          kitId={kitId}
          counts={state.counts}
          total={state.total}
          onPracticeAgain={() => {
            dispatch({ type: 'RESTART' });
            fetchDeck();
          }}
        />
      </PageShell>
    );
  }

  // SHOWING_FRONT | SHOWING_BACK
  const { deck, coveredIds, currentIndex, ratings } = state;
  const currentCard = deck[currentIndex];
  const ratedCount = Object.keys(ratings).length;
  const isRevealed = state.phase === 'SHOWING_BACK';

  return (
    <PageShell>
      {/* Deck order indicator — position + covered/not-seen badge (Req 15.7) */}
      <DeckOrderIndicator
        currentIndex={currentIndex}
        total={deck.length}
        coveredIds={coveredIds}
        currentFlashcardId={currentCard.id}
      />

      {/* Progress bar (Req 15.4) */}
      <ProgressBar rated={ratedCount} total={deck.length} />

      {/* Flashcard viewer — front always visible, back revealed on demand (Req 15.1) */}
      <FlashcardViewer
        flashcard={currentCard}
        revealed={isRevealed}
        onReveal={() => dispatch({ type: 'REVEAL' })}
      />

      {/* Confidence rater — shown only after reveal (Req 15.2) */}
      {isRevealed && (
        <div className="w-full max-w-2xl mx-auto">
          <ConfidenceRater
            flashcardId={currentCard.id}
            onRate={handleRate}
          />
        </div>
      )}
    </PageShell>
  );
}
