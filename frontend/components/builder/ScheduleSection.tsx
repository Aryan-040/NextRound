'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { DayEntry, Question } from '@/types';
import { apiFetch } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleSectionProps {
  kitId: string;
  schedule: { days_available: number; days: DayEntry[] };
  questions: Question[];
  isRegenerating?: boolean;
  onRegenerateStart: () => void;
}

type Difficulty = 1 | 2 | 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  technical:       'Technical',
  behavioural:     'Behavioural',
  'system-design': 'System Design',
  'company-fit':   'Company Fit',
};

const CATEGORY_COLOR: Record<string, string> = {
  technical:       'bg-accent/15 text-accent border-accent/20',
  behavioural:     'bg-warning/15 text-warning border-warning/20',
  'system-design': 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'company-fit':   'bg-success/15 text-success border-success/20',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  1: 'text-success',
  2: 'text-warning',
  3: 'text-danger',
};
const DIFFICULTY_DOT: Record<Difficulty, string> = {
  1: 'bg-success',
  2: 'bg-warning',
  3: 'bg-danger',
};

function focusColor(focus: string): string {
  const l = focus.toLowerCase();
  if (l.includes('system')) return 'text-purple-400';
  if (l.includes('technical')) return 'text-accent';
  if (l.includes('behavioural') || l.includes('behavioral')) return 'text-warning';
  return 'text-success';
}

function completedKey(kitId: string) {
  return `schedule-completed:${kitId}`;
}

function loadCompleted(kitId: string): Set<number> {
  try {
    const raw = localStorage.getItem(completedKey(kitId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveCompleted(kitId: string, completed: Set<number>) {
  try {
    localStorage.setItem(completedKey(kitId), JSON.stringify([...completed]));
  } catch { /* ignore */ }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
      className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true">
      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Summary stats ────────────────────────────────────────────────────────────

function ScheduleSummary({
  days,
  completedCount,
}: {
  days: DayEntry[];
  completedCount: number;
}) {
  const totalMins  = days.reduce((s, d) => s + d.minutes, 0);
  const totalQs    = days.reduce((s, d) => s + d.question_ids.length, 0);
  const avgMins    = days.length > 0 ? Math.round(totalMins / days.length) : 0;
  const pct        = days.length > 0 ? Math.round((completedCount / days.length) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { value: `${completedCount}/${days.length}`, label: 'Days done', highlight: completedCount === days.length },
        { value: `${(totalMins / 60).toFixed(1)}h`, label: 'Total time', highlight: false },
        { value: `${avgMins} min`, label: 'Avg per day', highlight: false },
        { value: String(totalQs), label: 'Total questions', highlight: false },
      ].map(({ value, label, highlight }) => (
        <div
          key={label}
          className={`rounded-lg px-3 py-2.5 text-center border transition-colors ${
            highlight
              ? 'bg-success/10 border-success/30'
              : 'bg-bg-raised border-bg-raised/80'
          }`}
        >
          <p className={`text-base font-sans font-semibold leading-none ${highlight ? 'text-success' : 'text-text-primary'}`}>
            {value}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-secondary">Overall progress</span>
        <span className="text-xs font-medium text-text-primary">{pct}%</span>
      </div>
      <div className="h-1.5 bg-bg-raised rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% of days completed`}
        />
      </div>
    </div>
  );
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function StudyLoadHeatmap({ days, completedDays }: { days: DayEntry[]; completedDays: Set<number> }) {
  if (days.length === 0) return null;
  const maxQs = Math.max(...days.map(d => d.question_ids.length), 1);

  const intensityClass = (count: number, done: boolean) => {
    if (done) return 'bg-success/70';
    if (count === 0) return 'bg-bg-raised';
    const r = count / maxQs;
    if (r >= 0.8) return 'bg-accent';
    if (r >= 0.5) return 'bg-accent/60';
    if (r >= 0.2) return 'bg-accent/35';
    return 'bg-accent/15';
  };

  return (
    <div>
      <p className="text-xs text-text-secondary mb-2">Study load</p>
      <div className="flex flex-wrap gap-1">
        {days.map(d => (
          <div
            key={d.day}
            className={`w-5 h-5 rounded transition-colors ${intensityClass(d.question_ids.length, completedDays.has(d.day))}`}
            title={`Day ${d.day}: ${completedDays.has(d.day) ? '✓ Done · ' : ''}${d.question_ids.length} question${d.question_ids.length !== 1 ? 's' : ''} · ${d.minutes} min`}
            aria-label={`Day ${d.day}${completedDays.has(d.day) ? ' completed' : ''}: ${d.question_ids.length} questions`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <div className="w-3 h-3 rounded bg-success/70" aria-hidden="true" />
        <span className="text-[10px] text-text-secondary mr-2">Done</span>
        <span className="text-[10px] text-text-secondary">Less</span>
        {['bg-accent/15', 'bg-accent/35', 'bg-accent/60', 'bg-accent'].map(c => (
          <div key={c} className={`w-3 h-3 rounded ${c}`} aria-hidden="true" />
        ))}
        <span className="text-[10px] text-text-secondary">More</span>
      </div>
    </div>
  );
}

// ─── Question row inside expanded day ────────────────────────────────────────

function QuestionRow({ question }: { question: Question }) {
  const diff = (question.difficulty ?? 1) as Difficulty;
  const cat  = question.category ?? 'technical';

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-bg-raised/40 last:border-0">
      {/* Difficulty dot */}
      <div className="mt-1.5 shrink-0">
        <div
          className={`w-2 h-2 rounded-full ${DIFFICULTY_DOT[diff]}`}
          title={DIFFICULTY_LABEL[diff]}
          aria-label={`Difficulty: ${DIFFICULTY_LABEL[diff]}`}
        />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        {/* Prompt */}
        <p className="text-sm text-text-primary leading-snug">{question.prompt}</p>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${CATEGORY_COLOR[cat] ?? CATEGORY_COLOR.technical}`}
          >
            {CATEGORY_LABEL[cat] ?? cat}
          </span>
          <span className={`text-[10px] font-medium ${DIFFICULTY_COLOR[diff]}`}>
            {DIFFICULTY_LABEL[diff]}
          </span>
          <span className="text-[10px] text-text-secondary flex items-center gap-0.5">
            <ClockIcon className="h-3 w-3" />
            ~15 min
          </span>
        </div>

        {/* Answer outline preview — collapsed to one line */}
        {question.answer_outline && (
          <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
            {question.answer_outline}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── DayCard ──────────────────────────────────────────────────────────────────

function DayCard({
  entry,
  questions,
  completed,
  isToday,
  onToggleComplete,
}: {
  entry: DayEntry;
  questions: Question[];
  completed: boolean;
  isToday: boolean;
  onToggleComplete: (day: number) => void;
}) {
  const [open, setOpen] = useState(isToday);

  const dayQuestions = useMemo(
    () => entry.question_ids.map(id => questions.find(q => q.id === id)).filter(Boolean) as Question[],
    [entry.question_ids, questions],
  );

  const hardCount   = dayQuestions.filter(q => q.difficulty === 3).length;
  const medCount    = dayQuestions.filter(q => q.difficulty === 2).length;

  return (
    <div
      className={[
        'rounded-lg border transition-all duration-200 overflow-hidden',
        completed
          ? 'bg-success/5 border-success/20'
          : isToday
          ? 'bg-accent/5 border-accent/30 shadow-sm shadow-accent/10'
          : 'bg-bg-raised border-bg-raised/60',
      ].join(' ')}
    >
      {/* ── Row header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={`day-${entry.day}-questions`}
      >
        {/* Complete toggle */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggleComplete(entry.day); }}
          aria-label={completed ? `Mark day ${entry.day} incomplete` : `Mark day ${entry.day} complete`}
          className={[
            'shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            completed
              ? 'bg-success border-success text-white'
              : 'bg-transparent border-bg-raised hover:border-success/60',
          ].join(' ')}
        >
          {completed && <CheckIcon className="h-3.5 w-3.5" />}
        </button>

        {/* Day number */}
        <div className={[
          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold font-sans',
          completed ? 'bg-success/20 text-success' :
          isToday   ? 'bg-accent text-white' :
                      'bg-bg-surface text-text-secondary',
        ].join(' ')}>
          {entry.day}
        </div>

        {/* Focus + today badge */}
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          {isToday && !completed && (
            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent text-white">
              Today
            </span>
          )}
          {entry.focus ? (
            <span className={`text-sm font-medium truncate ${completed ? 'text-success/70 line-through' : focusColor(entry.focus)}`}>
              {entry.focus}
            </span>
          ) : (
            <span className="text-sm text-text-secondary italic">Rest day</span>
          )}
        </div>

        {/* Stats + chevron */}
        <div className="shrink-0 flex items-center gap-4">
          {/* Difficulty pills */}
          {!completed && dayQuestions.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5">
              {hardCount > 0 && (
                <span className="text-[10px] font-medium text-danger bg-danger/10 px-1.5 py-0.5 rounded">
                  {hardCount}H
                </span>
              )}
              {medCount > 0 && (
                <span className="text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                  {medCount}M
                </span>
              )}
            </div>
          )}

          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-text-primary leading-none">{entry.question_ids.length}</p>
            <p className="text-[10px] text-text-secondary mt-0.5">questions</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-text-primary leading-none">{entry.minutes}</p>
            <p className="text-[10px] text-text-secondary mt-0.5">min</p>
          </div>
          <ChevronIcon open={open} />
        </div>
      </div>

      {/* ── Expanded question list ── */}
      {open && (
        <div
          id={`day-${entry.day}-questions`}
          className="px-4 pb-3 border-t border-bg-raised/40"
        >
          {dayQuestions.length === 0 ? (
            <p className="text-xs text-text-secondary py-3 text-center italic">No questions scheduled for this day.</p>
          ) : (
            <div className="pt-1">
              {dayQuestions.map(q => (
                <QuestionRow key={q.id} question={q} />
              ))}
            </div>
          )}

          {/* Mark complete CTA at the bottom of expanded view */}
          {!completed && (
            <button
              type="button"
              onClick={() => onToggleComplete(entry.day)}
              className="mt-3 w-full py-2 rounded border border-dashed border-success/40 text-xs font-medium text-success/80 hover:bg-success/10 hover:border-success/60 hover:text-success transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-success"
            >
              ✓ Mark day {entry.day} as complete
            </button>
          )}
          {completed && (
            <button
              type="button"
              onClick={() => onToggleComplete(entry.day)}
              className="mt-3 w-full py-2 rounded border border-dashed border-bg-raised text-xs text-text-secondary hover:text-danger/70 hover:border-danger/30 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
            >
              Mark as incomplete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ScheduleSection ─────────────────────────────────────────────────────────

export function ScheduleSection({
  kitId,
  schedule,
  questions,
  isRegenerating = false,
  onRegenerateStart,
}: ScheduleSectionProps) {
  const [regenError, setRegenError]     = useState<string | null>(null);
  const [completedDays, setCompletedDays] = useState<Set<number>>(() => loadCompleted(kitId));

  // Reload completed state if kitId changes
  useEffect(() => {
    setCompletedDays(loadCompleted(kitId));
  }, [kitId]);

  const toggleComplete = useCallback((day: number) => {
    setCompletedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      saveCompleted(kitId, next);
      return next;
    });
  }, [kitId]);

  const handleRegenerate = useCallback(async () => {
    setRegenError(null);
    onRegenerateStart();
    try {
      await apiFetch(`/kits/${kitId}/regenerate`, { method: 'POST', body: { section: 'schedule' } });
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Regeneration failed. Please try again.');
    }
  }, [kitId, onRegenerateStart]);

  const { days_available, days } = schedule;
  const completedCount = days.filter(d => completedDays.has(d.day)).length;

  // Determine "today": the first incomplete day (simple heuristic)
  const todayDay = useMemo(() => {
    const first = days.find(d => !completedDays.has(d.day));
    return first?.day ?? null;
  }, [days, completedDays]);

  return (
    <section
      className="relative bg-bg-surface rounded-lg border border-bg-raised p-6 space-y-5"
      aria-labelledby="schedule-section-heading"
    >
      {/* Regeneration overlay */}
      {isRegenerating && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-bg-surface/80 backdrop-blur-[2px]"
          aria-live="polite"
          role="status"
        >
          <div className="flex items-center gap-2.5 text-sm text-text-primary">
            <Spinner size="sm" label="Regenerating..." />
            <span>Regenerating schedule…</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h2 id="schedule-section-heading" className="font-sans text-base font-semibold text-text-primary">
            Study schedule
          </h2>
          <p className="text-xs text-text-secondary">
            {days_available} day{days_available !== 1 ? 's' : ''} · {completedCount} completed
          </p>
        </div>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          aria-label="Regenerate study schedule"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-bg-raised text-text-secondary bg-transparent hover:text-accent hover:border-accent/50 hover:bg-bg-raised transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <RefreshIcon />
          Regenerate
        </button>
      </div>

      {regenError && (
        <div role="alert" className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">
          {regenError}
        </div>
      )}

      {days.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-8">
          No schedule generated yet. Regenerate to build one.
        </p>
      ) : (
        <>
          {/* Completion progress bar */}
          <ProgressBar completed={completedCount} total={days.length} />

          {/* Summary stats */}
          <ScheduleSummary days={days} completedCount={completedCount} />

          {/* Heatmap */}
          <StudyLoadHeatmap days={days} completedDays={completedDays} />

          {/* All-done banner */}
          {completedCount === days.length && days.length > 0 && (
            <div className="flex items-center gap-3 bg-success/10 border border-success/20 rounded-lg px-4 py-3">
              <span className="text-xl" aria-hidden="true">🎉</span>
              <div>
                <p className="text-sm font-semibold text-success">Schedule complete!</p>
                <p className="text-xs text-text-secondary mt-0.5">You've finished all {days.length} days of prep. Good luck in the interview!</p>
              </div>
            </div>
          )}

          {/* Day cards */}
          <div className="space-y-2">
            {days.map(entry => (
              <DayCard
                key={entry.day}
                entry={entry}
                questions={questions}
                completed={completedDays.has(entry.day)}
                isToday={entry.day === todayDay}
                onToggleComplete={toggleComplete}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
