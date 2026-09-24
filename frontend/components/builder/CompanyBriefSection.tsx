'use client';

/**
 * CompanyBriefSection — editable company brief panel in the Kit Builder.
 *
 * Displays `summary` and `what_they_do` as click-to-edit text fields.
 * Provides a RegenerateButton that triggers POST /regenerate with
 * section: 'company-brief'.
 *
 * Requirements: 11.1, 11.2, 11.3, 14.1, 14.4, 14.5, 14.6
 */
import {
  useState,
  useRef,
  useCallback,
  KeyboardEvent,
} from 'react';
import { Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';

// --- Types --------------------------------------------------------------------

export interface CompanyBriefSectionProps {
  kitId: string;
  brief: {
    summary: string;
    what_they_do: string;
    sources?: string[];
  };
  onUpdate: (updated: { summary: string; what_they_do: string }) => void;
  isRegenerating?: boolean;
  onRegenerateStart: () => void;
}

// --- EditableText -------------------------------------------------------------

interface EditableTextProps {
  value: string;
  label: string;
  hint?: string;
  onSave: (newValue: string) => Promise<void>;
}

function EditableText({ value, label, hint, onSave }: EditableTextProps) {
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
      await onSave(draft);
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

  return (
    <div className="group">
      <p className="text-sm font-semibold text-text-primary mb-2">{label}</p>

      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={6}
            aria-label={`Edit ${label}`}
            className={[
              'w-full bg-bg-raised border rounded-md px-3 py-2',
              'text-sm text-text-primary font-sans leading-relaxed resize-y',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent/50',
              'transition-colors duration-150',
              saveError ? 'border-danger' : 'border-bg-raised',
            ].filter(Boolean).join(' ')}
            disabled={saving}
          />
          {hint && !saveError && (
            <p className="text-xs text-text-secondary">{hint}</p>
          )}
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
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          aria-label={`Edit ${label}. Click to edit.`}
          className={[
            'w-full text-left rounded-md px-3 py-2 -mx-3',
            'text-sm text-text-primary font-sans leading-relaxed',
            'hover:bg-bg-raised cursor-text transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
          ].filter(Boolean).join(' ')}
        >
          <span className="whitespace-pre-wrap break-words">{value}</span>
          <span
            className="ml-2 inline-flex items-center gap-1 text-accent text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            aria-hidden="true"
          >
            <PencilIcon />
            Edit
          </span>
        </button>
      )}
    </div>
  );
}

// --- PencilIcon ---------------------------------------------------------------

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

// --- RefreshIcon --------------------------------------------------------------

function RefreshIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
    </svg>
  );
}

// --- CompanyBriefSection ------------------------------------------------------

export function CompanyBriefSection({
  kitId,
  brief,
  onUpdate,
  isRegenerating = false,
  onRegenerateStart,
}: CompanyBriefSectionProps) {
  const [regenError, setRegenError] = useState<string | null>(null);

  const handleSaveSummary = useCallback(
    async (newValue: string) => {
      await apiFetch(`/kits/${kitId}`, {
        method: 'PATCH',
        body: { company_brief: { ...brief, summary: newValue } },
      });
      onUpdate({ ...brief, summary: newValue });
    },
    [kitId, brief, onUpdate]
  );

  const handleSaveWhatTheyDo = useCallback(
    async (newValue: string) => {
      await apiFetch(`/kits/${kitId}`, {
        method: 'PATCH',
        body: { company_brief: { ...brief, what_they_do: newValue } },
      });
      onUpdate({ ...brief, what_they_do: newValue });
    },
    [kitId, brief, onUpdate]
  );

  const handleRegenerate = useCallback(async () => {
    setRegenError(null);
    // Open SSE connection FIRST so we don't miss any events
    onRegenerateStart();
    try {
      await apiFetch(`/kits/${kitId}/regenerate`, {
        method: 'POST',
        body: { section: 'company-brief' },
      });
    } catch (err) {
      setRegenError(
        err instanceof Error ? err.message : 'Regeneration failed. Please try again.'
      );
    }
  }, [kitId, onRegenerateStart]);

  return (
    <section
      className="relative bg-bg-surface rounded-lg border border-bg-raised p-6 space-y-6"
      aria-labelledby="company-brief-heading"
    >
      {/* Inline regeneration overlay — covers only this card */}
      {isRegenerating && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-bg-surface/80 backdrop-blur-[2px]"
          aria-live="polite"
          role="status"
        >
          <div className="flex items-center gap-2.5 text-sm text-text-primary">
            <Spinner size="sm" label="Regenerating..." />
            <span>Regenerating company brief…</span>
          </div>
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center justify-between gap-4">
        <h2
          id="company-brief-heading"
          className="font-sans text-base font-semibold text-text-primary"
        >
          Company brief
        </h2>

        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          aria-label="Regenerate company brief"
          className={[
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium',
            'border border-bg-raised/60 text-text-secondary bg-transparent',
            'hover:text-accent hover:border-accent/50 hover:bg-bg-raised transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'disabled:pointer-events-none disabled:opacity-50',
          ].join(' ')}
        >
          <RefreshIcon />
          Regenerate
        </button>
      </div>

      {regenError && (
        <div role="alert" className="text-sm text-danger bg-[#7f1d1d]/40 border border-danger/30 rounded px-3 py-2">
          {regenError}
        </div>
      )}

      {/* Editable fields */}
      <div className="space-y-6">
        <EditableText
          value={brief.summary}
          label="Summary"
          hint="Press Ctrl+Enter or click Save. Press Escape to cancel."
          onSave={handleSaveSummary}
        />
        <EditableText
          value={brief.what_they_do}
          label="What they do"
          hint="Press Ctrl+Enter or click Save. Press Escape to cancel."
          onSave={handleSaveWhatTheyDo}
        />
      </div>

      {/* Sources (read-only) */}
      {brief.sources && brief.sources.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-text-primary mb-2">Sources</p>
          <ul className="space-y-1">
            {brief.sources.map((src) => (
              <li key={src}>
                <a
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:text-accent transition-colors break-all"
                >
                  {src}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
