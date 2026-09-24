'use client';
import type { KitDocument } from '@/types';

export function KitStatsBar({ kit }: { kit: KitDocument }) {
  const questions  = kit.questions  ?? [];
  const flashcards = kit.flashcards ?? [];
  const days       = kit.schedule?.days ?? [];
  const totalMins  = days.reduce((s, d) => s + d.minutes, 0);
  const totalHours = totalMins >= 60 ? `${(totalMins / 60).toFixed(1)}h` : `${totalMins}m`;
  const mustTotal  = (kit.role?.requirements ?? []).filter(r => r.priority === 'must').length;
  const uncovered  = kit.coverage?.uncovered_requirement_ids?.length ?? 0;
  const coveragePct = mustTotal > 0 ? Math.round(((mustTotal - uncovered) / mustTotal) * 100) : 100;
  const hard = questions.filter(q => q.difficulty === 3).length;
  const med  = questions.filter(q => q.difficulty === 2).length;
  const easy = questions.filter(q => q.difficulty === 1).length;
  const cats = [
    { key: 'technical', label: 'Technical' }, { key: 'behavioural', label: 'Behavioural' },
    { key: 'system-design', label: 'System design' }, { key: 'company-fit', label: 'Company fit' },
  ] as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-bg-raised pb-4">
        {[{ value: questions.length, label: 'Questions' }, { value: flashcards.length, label: 'Flashcards' },
          { value: totalHours, label: 'Study time' }, { value: `${coveragePct}%`, label: 'Coverage' }, { value: days.length, label: 'Days' }]
          .map(({ value, label }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-2xl font-bold text-text-primary font-sans leading-none tabular-nums">{value}</span>
              <span className="text-xs text-text-secondary">{label}</span>
            </div>
          ))}
      </div>
      {questions.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-secondary mr-1">Difficulty:</span>
            {hard > 0 && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-danger/15 text-danger">{hard} hard</span>}
            {med  > 0 && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning">{med} medium</span>}
            {easy > 0 && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">{easy} easy</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-secondary mr-1">By type:</span>
            {cats.map(({ key, label }) => {
              const count = questions.filter(q => q.category === key).length;
              return count === 0 ? null : (
                <span key={key} className="text-xs px-2 py-0.5 rounded-full bg-bg-raised text-text-primary">{label} <span className="text-text-secondary">{count}</span></span>
              );
            })}
          </div>
        </div>
      )}
      {uncovered > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-[#713f12]/20 px-3 py-2.5">
          <svg className="h-4 w-4 text-warning shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-warning">{uncovered} requirement{uncovered !== 1 ? 's are' : ' is'} not covered. Regenerate questions to fill the gap.</p>
        </div>
      )}
    </div>
  );
}
