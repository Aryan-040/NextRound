'use client';

/**
 * FlashcardsSection — flashcard panel in the Kit Builder.
 *
 * Renders a list of FlashcardCards with inline editing for front and back,
 * a PinnedIndicator on user-edited cards, a delete control, and an
 * AddFlashcardButton.  All edits set `pinned: true` (Requirement 11.2).
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 13.2, 13.3
 */
import {
  useState,
  useRef,
  useCallback,
  KeyboardEvent,
} from 'react';
import Link from 'next/link';
import type { Flashcard } from '@/types';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

function RefreshIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FlashcardsSectionProps {
  kitId: string;
  flashcards: Flashcard[];
  onUpdate: (updatedFlashcards: Flashcard[]) => void;
  isRegenerating?: boolean;
  onRegenerateStart: () => void;
}

// ─── Persistence helper ────────────────────────────────────────────────────────

async function persistFlashcards(
  kitId: string,
  flashcards: Flashcard[]
): Promise<void> {
  await apiFetch(`/kits/${kitId}`, {
    method: 'PATCH',
    body: { flashcards },
  });
}

// ─── PinnedIndicator ──────────────────────────────────────────────────────────

function PinnedIndicator() {
  return (
    <span
      aria-label="Edited by you"
      title="Edited by you"
      className="inline-flex items-center text-accent shrink-0"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

// ─── EditableTextarea ─────────────────────────────────────────────────────────

interface EditableTextareaProps {
  value: string;
  label: string;
  placeholder?: string;
  onSave: (newValue: string) => Promise<void>;
}

function EditableTextarea({ value, label, placeholder, onSave }: EditableTextareaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = useCallback(() => {
    setDraft(value);
    setSaveError(null);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [value]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
    setSaveError(null);
  }, [value]);

  const save = useCallback(async () => {
    if (draft.trim() === value.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') cancel();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    },
    [cancel, save]
  );

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          aria-label={`Edit ${label}`}
          disabled={saving}
          className={[
            'w-full bg-bg-base border rounded-md px-2 py-1.5',
            'text-sm text-text-primary font-sans leading-relaxed resize-y',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent',
            'transition-colors duration-150',
            saveError ? 'border-danger' : 'border-bg-raised',
          ].join(' ')}
        />
        {saveError && (
          <p role="alert" className="text-xs text-danger">{saveError}</p>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={save} loading={saving} disabled={saving}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
        </div>
        <p className="text-xs text-text-secondary">Ctrl+Enter to save quickly</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label={`Edit ${label}. Click to edit.`}
      className="w-full text-left group"
    >
      <p
        className={[
          'text-sm font-sans leading-relaxed',
          value ? 'text-text-primary' : 'text-text-secondary italic',
          'hover:text-accent/80 transition-colors duration-150',
        ].join(' ')}
      >
        {value || placeholder || `No ${label.toLowerCase()} — click to add`}
      </p>
    </button>
  );
}

// ─── FlashcardCard ─────────────────────────────────────────────────────────────

interface FlashcardCardProps {
  flashcard: Flashcard;
  allFlashcards: Flashcard[];
  kitId: string;
  onUpdate: (updatedFlashcards: Flashcard[]) => void;
}

function FlashcardCard({
  flashcard,
  allFlashcards,
  kitId,
  onUpdate,
}: FlashcardCardProps) {

  const applyFlashcardEdit = useCallback(
    async (patch: Partial<Flashcard>) => {
      const updated: Flashcard = { ...flashcard, ...patch, pinned: true };
      const updatedFlashcards = allFlashcards.map((f) =>
        f.id === flashcard.id ? updated : f
      );
      await persistFlashcards(kitId, updatedFlashcards);
      onUpdate(updatedFlashcards);
    },
    [flashcard, allFlashcards, kitId, onUpdate]
  );

  const handleSaveFront = useCallback(
    (newFront: string) => applyFlashcardEdit({ front: newFront }),
    [applyFlashcardEdit]
  );

  const handleSaveBack = useCallback(
    (newBack: string) => applyFlashcardEdit({ back: newBack }),
    [applyFlashcardEdit]
  );

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm('Delete this flashcard?');
    if (!confirmed) return;

    await apiFetch(`/kits/${kitId}/flashcards/${flashcard.id}`, { method: 'DELETE' });
    onUpdate(allFlashcards.filter((f) => f.id !== flashcard.id));
  }, [flashcard.id, allFlashcards, kitId, onUpdate]);

  return (
    <div className="bg-bg-raised rounded-lg border border-bg-raised/50 overflow-hidden">
      {/* Card header row */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-bg-raised/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-secondary">Flashcard</span>
          {flashcard.pinned && <PinnedIndicator />}
        </div>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Delete flashcard"
          className="text-xs text-text-secondary hover:text-danger transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-danger rounded px-1 py-0.5"
        >
          Delete
        </button>
      </div>

      {/* Front side */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-xs font-medium text-accent mb-1.5">Front</p>
        <EditableTextarea
          value={flashcard.front}
          label="flashcard front"
          placeholder="Question or prompt…"
          onSave={handleSaveFront}
        />
      </div>

      <div className="mx-4 border-t border-bg-raised/30" aria-hidden="true" />

      {/* Back side */}
      <div className="px-4 pt-2 pb-3">
        <p className="text-xs font-medium text-text-secondary mb-1.5">Back</p>
        <EditableTextarea
          value={flashcard.back}
          label="flashcard back"
          placeholder="Answer or explanation…"
          onSave={handleSaveBack}
        />
      </div>
    </div>
  );
}

// ─── AddFlashcardButton ───────────────────────────────────────────────────────

interface AddFlashcardButtonProps {
  kitId: string;
  allFlashcards: Flashcard[];
  onUpdate: (updatedFlashcards: Flashcard[]) => void;
}

function AddFlashcardButton({
  allFlashcards,
  onUpdate,
}: AddFlashcardButtonProps) {
  const handleAdd = useCallback(() => {
    const newFlashcard: Flashcard = {
      id: `f_new_${Date.now()}`,
      front: '',
      back: '',
      requirement_ids: [],
      pinned: true,
    };
    onUpdate([...allFlashcards, newFlashcard]);
  }, [allFlashcards, onUpdate]);

  return (
    <button
      type="button"
      onClick={handleAdd}
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium',
        'border border-dashed border-bg-raised text-text-secondary bg-transparent',
        'hover:border-accent/50 hover:text-accent hover:bg-bg-raised transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
      </svg>
      Add flashcard
    </button>
  );
}

// ─── FlashcardsSection ────────────────────────────────────────────────────────

export function FlashcardsSection({
  kitId,
  flashcards,
  onUpdate,
  isRegenerating = false,
  onRegenerateStart,
}: FlashcardsSectionProps) {
  const [regenError, setRegenError] = useState<string | null>(null);

  const handleRegenerate = useCallback(async () => {
    setRegenError(null);
    // Open SSE connection FIRST so we don't miss any events
    onRegenerateStart();
    try {
      await apiFetch(`/kits/${kitId}/regenerate`, { method: 'POST', body: { section: 'flashcards' } });
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Regeneration failed. Please try again.');
    }
  }, [kitId, onRegenerateStart]);

  return (
    <section
      className="relative bg-bg-surface rounded-lg border border-bg-raised p-6 space-y-4"
      aria-labelledby="flashcards-section-heading"
    >
      {/* Inline regeneration overlay */}
      {isRegenerating && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-bg-surface/80 backdrop-blur-[2px]"
          aria-live="polite"
          role="status"
        >
          <div className="flex items-center gap-2.5 text-sm text-text-primary">
            <Spinner size="sm" label="Regenerating..." />
            <span>Regenerating flashcards…</span>
          </div>
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center justify-between gap-4">
        <h2
          id="flashcards-section-heading"
          className="font-sans text-base font-semibold text-text-primary"
        >
          Flashcards
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-secondary">
            {flashcards.length} card{flashcards.length !== 1 ? 's' : ''}
          </span>
          {/* Practice Mode entry — only when there are cards to practise */}
          {flashcards.length > 0 && (
            <Link
              href={`/kits/${kitId}/practice`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-accent/40 text-accent bg-accent/5 hover:bg-accent/15 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={`Practice ${flashcards.length} flashcard${flashcards.length !== 1 ? 's' : ''}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.963 8.963 0 00-4.25 1.065V16.82zM9.25 4.065A8.963 8.963 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11a.75.75 0 00.954.721A7.506 7.506 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.065z" />
              </svg>
              Practice
            </Link>
          )}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            aria-label="Regenerate flashcards"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-bg-raised text-text-secondary bg-transparent hover:text-accent hover:border-accent/50 hover:bg-bg-raised transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshIcon />
            Regenerate
          </button>
        </div>
      </div>

      {regenError && (
        <div role="alert" className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">
          {regenError}
        </div>
      )}

      {/* Flashcard list */}
      {flashcards.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-8">
          No flashcards yet. Add one below or wait for generation to complete.
        </p>
      ) : (
        <div className="space-y-3">
          {flashcards.map((fc) => (
            <FlashcardCard
              key={fc.id}
              flashcard={fc}
              allFlashcards={flashcards}
              kitId={kitId}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}

      {/* Bottom control */}
      <div className="pt-2 border-t border-bg-raised/60">
        <AddFlashcardButton
          kitId={kitId}
          allFlashcards={flashcards}
          onUpdate={onUpdate}
        />
      </div>
    </section>
  );
}
