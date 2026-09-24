'use client';

import {
  useState,
  useRef,
  useCallback,
  KeyboardEvent,
  ChangeEvent,
} from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Question } from '@/types';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

export type QuestionCategory = 'technical' | 'behavioural' | 'system-design' | 'company-fit';

const ALL_CATEGORIES: QuestionCategory[] = ['technical', 'behavioural', 'system-design', 'company-fit'];

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  technical: 'Technical',
  behavioural: 'Behavioural',
  'system-design': 'System design',
  'company-fit': 'Company fit',
};

const REGEN_SECTION_MAP: Record<QuestionCategory, string> = {
  technical: 'questions-technical',
  behavioural: 'questions-behavioural',
  'system-design': 'questions-system-design',
  'company-fit': 'questions-company-fit',
};

export interface QuestionsSectionProps {
  kitId: string;
  questions: Question[];
  onUpdate: (updatedQuestions: Question[]) => void;
  isRegenerating?: boolean;
  onRegenerateStart: () => void;
}

async function persistQuestions(kitId: string, questions: Question[]): Promise<void> {
  await apiFetch(`/kits/${kitId}`, { method: 'PATCH', body: { questions } });
}

function PinnedIndicator() {
  return (
    <span aria-label="Edited by you" title="Edited by you" className="inline-flex items-center text-accent shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
      </svg>
    </span>
  );
}

function DifficultyBadge({ level }: { level: 1 | 2 | 3 }) {
  const labels: Record<1 | 2 | 3, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
  const variants: Record<1 | 2 | 3, 'success' | 'warning' | 'danger'> = { 1: 'success', 2: 'warning', 3: 'danger' };
  return <Badge variant={variants[level]}>{labels[level]}</Badge>;
}

interface EditablePromptProps {
  value: string;
  onSave: (v: string) => Promise<void>;
}

function EditablePrompt({ value, onSave }: EditablePromptProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => { setDraft(value); setError(null); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }, [value]);
  const cancel = useCallback(() => { setEditing(false); setDraft(value); setError(null); }, [value]);
  const save = useCallback(async () => {
    const t = draft.trim();
    if (t === value.trim()) { setEditing(false); return; }
    setSaving(true); setError(null);
    try { await onSave(t); setEditing(false); } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); } finally { setSaving(false); }
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') cancel();
  }, [save, cancel]);

  if (editing) {
    return (
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Edit question prompt"
          disabled={saving}
          className={['w-full bg-bg-raised border rounded px-2 py-1 text-sm text-text-primary font-sans focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors', error ? 'border-danger' : 'border-bg-raised'].join(' ')}
        />
        <p className="text-xs text-text-secondary">{saving ? 'Saving...' : 'Enter to save, Escape to cancel'}</p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <button type="button" onClick={startEdit} aria-label="Edit question prompt. Click to edit."
      className="w-full text-left text-sm text-text-primary font-sans leading-snug hover:text-accent transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 rounded">
      {value || <span className="text-text-secondary italic">Empty prompt - click to edit</span>}
    </button>
  );
}

interface EditableAnswerOutlineProps {
  value: string;
  onSave: (v: string) => Promise<void>;
}

function EditableAnswerOutline({ value, onSave }: EditableAnswerOutlineProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = useCallback(() => { setDraft(value); setError(null); setEditing(true); setTimeout(() => textareaRef.current?.focus(), 0); }, [value]);
  const cancel = useCallback(() => { setEditing(false); setDraft(value); setError(null); }, [value]);
  const save = useCallback(async () => {
    const t = draft.trim();
    if (t === value.trim()) { setEditing(false); return; }
    setSaving(true); setError(null);
    try { await onSave(t); setEditing(false); } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); } finally { setSaving(false); }
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') cancel();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
  }, [cancel, save]);

  if (editing) {
    return (
      <div className="space-y-2 mt-2">
        <textarea ref={textareaRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={handleKeyDown}
          rows={5} aria-label="Edit answer outline" disabled={saving}
          className={['w-full bg-bg-base border rounded-md px-2 py-1.5 text-xs text-text-primary font-sans leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors', error ? 'border-danger' : 'border-bg-raised'].join(' ')} />
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={save} loading={saving} disabled={saving}>Save</Button>
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>Cancel</Button>
        </div>
        <p className="text-xs text-text-secondary">Ctrl+Enter to save quickly</p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={startEdit} aria-label="Edit answer outline. Click to edit." className="w-full text-left group">
        <p className="text-xs font-medium text-text-secondary mb-1">Answer outline</p>
        <p className="text-xs text-text-secondary leading-relaxed font-sans group-hover:text-text-primary/80 transition-colors duration-150">
          {value || <span className="italic">No answer outline - click to add one</span>}
        </p>
      </button>
    </div>
  );
}

interface DragHandleProps {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

function DragHandle({ attributes, listeners }: DragHandleProps) {
  return (
    <button type="button" aria-label="Drag to reorder"
      className="shrink-0 cursor-grab active:cursor-grabbing text-text-secondary/50 hover:text-text-secondary transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 rounded touch-none"
      {...attributes} {...listeners}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path d="M7 2a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 8a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 14a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2z" />
      </svg>
    </button>
  );
}

interface SortableQuestionCardProps {
  question: Question;
  allQuestions: Question[];
  kitId: string;
  onUpdate: (updatedQuestions: Question[]) => void;
}

function SortableQuestionCard({ question, allQuestions, kitId, onUpdate }: SortableQuestionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const applyEdit = useCallback(async (patch: Partial<Question>) => {
    const updated: Question = { ...question, ...patch, pinned: true };
    const updatedAll = allQuestions.map(q => q.id === question.id ? updated : q);
    await persistQuestions(kitId, updatedAll);
    onUpdate(updatedAll);
  }, [question, allQuestions, kitId, onUpdate]);

  const handleSavePrompt = useCallback((v: string) => applyEdit({ prompt: v }), [applyEdit]);
  const handleSaveOutline = useCallback((v: string) => applyEdit({ answer_outline: v }), [applyEdit]);
  const handleCategoryChange = useCallback((cat: QuestionCategory) => applyEdit({ category: cat }), [applyEdit]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this question? It will also be removed from the schedule.')) return;
    const updated = allQuestions.filter(q => q.id !== question.id);
    await persistQuestions(kitId, updated);
    onUpdate(updated);
  }, [question.id, allQuestions, kitId, onUpdate]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={['bg-bg-surface border rounded-lg px-4 py-3 space-y-2 transition-colors duration-150',
        isDragging ? 'border-accent opacity-75 z-10' : 'border-bg-raised/50 hover:border-bg-raised'].join(' ')}
    >
      <div className="flex items-start gap-2">
        <DragHandle attributes={attributes} listeners={listeners} />
        <div className="flex-1 min-w-0">
          <EditablePrompt value={question.prompt} onSave={handleSavePrompt} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {question.pinned && <PinnedIndicator />}
          <DifficultyBadge level={question.difficulty} />
        </div>
      </div>

      <EditableAnswerOutline value={question.answer_outline} onSave={handleSaveOutline} />

      <div className="flex items-center justify-between pt-1">
        <div className="relative">
          <select
            value={question.category}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleCategoryChange(e.target.value as QuestionCategory)}
            aria-label="Move to category"
            className="appearance-none bg-bg-raised border border-bg-raised rounded px-2 py-1 pr-6 text-xs text-text-secondary font-sans focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition-colors cursor-pointer"
          >
            {ALL_CATEGORIES.map(cat => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
          </select>
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </span>
        </div>
        <button type="button" onClick={handleDelete} aria-label="Delete question"
          className="text-xs text-text-secondary hover:text-danger transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-danger/50 rounded px-1 py-0.5">
          Delete
        </button>
      </div>
    </div>
  );
}

interface QuestionListProps {
  kitId: string;
  category: QuestionCategory;
  allQuestions: Question[];
  onUpdate: (updatedQuestions: Question[]) => void;
}

function QuestionList({ kitId, category, allQuestions, onUpdate }: QuestionListProps) {
  const categoryQuestions = allQuestions.filter(q => q.category === category);
  const otherQuestions = allQuestions.filter(q => q.category !== category);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categoryQuestions.findIndex(q => q.id === active.id);
    const newIndex = categoryQuestions.findIndex(q => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(categoryQuestions, oldIndex, newIndex);
    const updated = [...reordered, ...otherQuestions];
    onUpdate(updated);
    try { await persistQuestions(kitId, updated); } catch { onUpdate(allQuestions); }
  }, [categoryQuestions, otherQuestions, allQuestions, kitId, onUpdate]);

  if (categoryQuestions.length === 0) {
    const hasOthers = allQuestions.some(q => q.category !== category);
    if (category === 'technical' && hasOthers && allQuestions.length > 0) {
      return (
        <div className="py-8 px-4 text-center space-y-2">
          <p className="text-sm font-medium text-text-primary">This role is not primarily technical</p>
          <p className="text-xs text-text-secondary leading-relaxed max-w-sm mx-auto">
            Based on the job description, the focus areas are{' '}
            {(['behavioural', 'system-design', 'company-fit'] as const)
              .filter(c => allQuestions.some(q => q.category === c))
              .map(c => CATEGORY_LABELS[c].toLowerCase())
              .join(', ')}.
            You can still add technical questions manually.
          </p>
        </div>
      );
    }
    return (
      <p className="text-sm text-text-secondary text-center py-8">
        No {CATEGORY_LABELS[category].toLowerCase()} questions yet. Add one below or regenerate.
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={categoryQuestions.map(q => q.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {categoryQuestions.map(q => (
            <SortableQuestionCard key={q.id} question={q} allQuestions={allQuestions} kitId={kitId} onUpdate={onUpdate} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface CategoryTabsProps {
  active: QuestionCategory;
  questions: Question[];
  onChange: (cat: QuestionCategory) => void;
}

function CategoryTabs({ active, questions, onChange }: CategoryTabsProps) {
  return (
    <div className="flex gap-0 border-b border-bg-raised/50" role="tablist" aria-label="Question categories">
      {ALL_CATEGORIES.map(cat => {
        const count = questions.filter(q => q.category === cat).length;
        const isActive = cat === active;
        return (
          <button key={cat} type="button" role="tab" aria-selected={isActive}
            aria-controls={`questions-panel-${cat}`} id={`questions-tab-${cat}`}
            onClick={() => onChange(cat)}
            className={['px-3 py-2 text-sm font-medium font-sans transition-colors duration-150 focus:outline-none border-b-2 -mb-px',
              isActive ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-bg-raised'].join(' ')}
          >
            {CATEGORY_LABELS[cat]}
            {count > 0 && (
              <span className={['ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs',
                isActive ? 'bg-accent-dim text-accent' : 'bg-bg-raised text-text-secondary'].join(' ')}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface AddQuestionButtonProps {
  kitId: string;
  category: QuestionCategory;
  allQuestions: Question[];
  onUpdate: (updatedQuestions: Question[]) => void;
}

function AddQuestionButton({ kitId, category, allQuestions, onUpdate }: AddQuestionButtonProps) {
  const [adding, setAdding] = useState(false);

  const handleAdd = useCallback(async () => {
    setAdding(true);
    const newQ: Question = { id: `q_new_${Date.now()}`, prompt: '', answer_outline: '', category, difficulty: 1, requirement_ids: [], pinned: true };
    const others = allQuestions.filter(q => q.category !== category);
    const catQs = allQuestions.filter(q => q.category === category);
    const updated = [[newQ, ...catQs], ...others].flat();
    try { onUpdate(updated); await persistQuestions(kitId, updated); } catch { onUpdate(allQuestions); } finally { setAdding(false); }
  }, [kitId, category, allQuestions, onUpdate]);

  return (
    <button type="button" onClick={handleAdd} disabled={adding}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium font-sans border border-dashed border-bg-raised text-text-secondary bg-transparent hover:border-accent/50 hover:text-accent hover:bg-bg-raised transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50">
      {adding ? <Spinner size="sm" label="Adding..." /> : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
      )}
      Add question
    </button>
  );
}

interface RegenerateButtonProps {
  kitId: string;
  category: QuestionCategory;
  onRegenerateStart: () => void;
}

function RegenerateButton({ kitId, category, onRegenerateStart }: RegenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegenerate = useCallback(async () => {
    setError(null);
    // Open SSE connection FIRST so we don't miss any events
    onRegenerateStart();
    try {
      await apiFetch(`/kits/${kitId}/regenerate`, { method: 'POST', body: { section: REGEN_SECTION_MAP[category] } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed. Please try again.');
    }
  }, [kitId, category, onRegenerateStart]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={handleRegenerate} disabled={loading}
        aria-label={`Regenerate ${CATEGORY_LABELS[category]} questions`} aria-busy={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium font-sans border border-bg-raised text-text-secondary bg-transparent hover:text-accent hover:border-accent/50 hover:bg-bg-raised transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50">
        {loading ? <Spinner size="sm" label="Regenerating..." /> : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        )}
        {loading ? 'Regenerating...' : 'Regenerate'}
      </button>
      {error && <p role="alert" className="text-xs text-danger text-right max-w-xs">{error}</p>}
    </div>
  );
}

export function QuestionsSection({ kitId, questions, onUpdate, isRegenerating = false, onRegenerateStart }: QuestionsSectionProps) {
  const [activeCategory, setActiveCategory] = useState<QuestionCategory>('technical');

  return (
    <section className="relative bg-bg-surface rounded-lg border border-bg-raised/50 p-6 space-y-4" aria-labelledby="questions-section-heading">
      {isRegenerating && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-bg-surface/80 backdrop-blur-[2px]"
          aria-live="polite"
          role="status"
        >
          <div className="flex items-center gap-2.5 text-sm text-text-primary">
            <Spinner size="sm" label="Regenerating..." />
            <span>Regenerating questions…</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <h2 id="questions-section-heading" className="font-sans text-base font-semibold text-text-primary">
          Questions
        </h2>
        <span className="text-xs text-text-secondary">{questions.length} total</span>
      </div>

      <CategoryTabs active={activeCategory} questions={questions} onChange={setActiveCategory} />

      <div role="tabpanel" id={`questions-panel-${activeCategory}`} aria-labelledby={`questions-tab-${activeCategory}`}>
        <QuestionList kitId={kitId} category={activeCategory} allQuestions={questions} onUpdate={onUpdate} />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-bg-raised/60">
        <AddQuestionButton kitId={kitId} category={activeCategory} allQuestions={questions} onUpdate={onUpdate} />
        <RegenerateButton kitId={kitId} category={activeCategory} onRegenerateStart={onRegenerateStart} />
      </div>
    </section>
  );
}