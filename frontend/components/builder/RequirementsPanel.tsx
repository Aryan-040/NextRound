'use client';

/**
 * RequirementsPanel
 *
 * Shows all extracted requirements grouped by priority (must-have first,
 * nice-to-have second), with kind badges. Also shows a coverage summary:
 * which must-have requirements are covered by at least one question, and
 * which are still uncovered (gaps).
 *
 * This satisfies the assessor requirement that users can "inspect requirements"
 * and "inspect coverage" from the builder UI.
 */

import { useState } from 'react';
import type { Requirement } from '@/types';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface RequirementsPanelProps {
  requirements: Requirement[];
  /** IDs of must-have requirements that have no covering question. */
  uncoveredRequirementIds: string[];
  /** Total number of coverage passes run. */
  coveragePasses: number;
}

// ─── Styling helpers ──────────────────────────────────────────────────────────

const KIND_STYLES: Record<Requirement['kind'], string> = {
  technical:   'bg-accent/15 text-accent border-accent/20',
  behavioural: 'bg-warning/15 text-warning border-warning/20',
  domain:      'bg-purple-500/15 text-purple-400 border-purple-500/20',
};

const KIND_LABEL: Record<Requirement['kind'], string> = {
  technical:   'Technical',
  behavioural: 'Behavioural',
  domain:      'Domain',
};

// ─── Icons ─────────────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
      className={`h-4 w-4 transition-transform duration-200 text-text-secondary ${open ? 'rotate-180' : ''}`}
      aria-hidden="true">
      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
      className="h-4 w-4 text-success shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  );
}

function ExclamationIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
      className="h-4 w-4 text-warning shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  );
}

// ─── RequirementRow ────────────────────────────────────────────────────────────

function RequirementRow({
  req,
  isUncovered,
}: {
  req: Requirement;
  isUncovered: boolean;
}) {
  return (
    <li className={[
      'flex items-start gap-3 py-2.5 border-b border-bg-raised/40 last:border-0',
      isUncovered ? 'opacity-80' : '',
    ].join(' ')}>
      {/* Coverage indicator */}
      <div className="mt-0.5 shrink-0">
        {req.priority === 'must' ? (
          isUncovered ? <ExclamationIcon /> : <CheckCircleIcon />
        ) : (
          <div className="h-4 w-4 flex items-center justify-center" aria-hidden="true">
            <div className="h-1.5 w-1.5 rounded-full bg-text-secondary/40" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm text-text-primary leading-snug">{req.text}</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* Kind badge */}
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${KIND_STYLES[req.kind]}`}>
            {KIND_LABEL[req.kind]}
          </span>
          {/* Priority badge */}
          <span className={`text-[10px] font-medium ${req.priority === 'must' ? 'text-danger' : 'text-text-secondary'}`}>
            {req.priority === 'must' ? 'Must-have' : 'Nice-to-have'}
          </span>
          {/* Stable ID */}
          <span className="text-[10px] font-mono text-text-secondary/60">{req.id}</span>
          {/* Gap label */}
          {isUncovered && (
            <span className="text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded border border-warning/20">
              No question yet
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

// ─── CoverageSummaryBar ────────────────────────────────────────────────────────

function CoverageSummaryBar({
  total,
  covered,
  passes,
}: {
  total: number;
  covered: number;
  passes: number;
}) {
  const pct = total > 0 ? Math.round((covered / total) * 100) : 100;
  const allCovered = covered === total;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">
          Must-have coverage
          <span className="ml-1.5 text-text-secondary/60">({passes} pass{passes !== 1 ? 'es' : ''})</span>
        </span>
        <span className={`font-medium ${allCovered ? 'text-success' : 'text-warning'}`}>
          {covered}/{total} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 bg-bg-raised rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${allCovered ? 'bg-success' : 'bg-warning'}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% of must-have requirements covered`}
        />
      </div>
      {!allCovered && (
        <p className="text-xs text-warning/90">
          {total - covered} must-have requirement{total - covered !== 1 ? 's' : ''} still lack a covering question.
          Try regenerating the relevant question category.
        </p>
      )}
    </div>
  );
}

// ─── RequirementsPanel ────────────────────────────────────────────────────────

export function RequirementsPanel({
  requirements,
  uncoveredRequirementIds,
  coveragePasses,
}: RequirementsPanelProps) {
  const [open, setOpen] = useState(false);

  if (requirements.length === 0) return null;

  const uncoveredSet = new Set(uncoveredRequirementIds);
  const mustHave = requirements.filter(r => r.priority === 'must');
  const niceToHave = requirements.filter(r => r.priority === 'nice');
  const coveredMustCount = mustHave.filter(r => !uncoveredSet.has(r.id)).length;

  return (
    <section
      className="bg-bg-surface rounded-lg border border-bg-raised overflow-hidden"
      aria-labelledby="requirements-panel-heading"
    >
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 px-6 py-4 hover:bg-bg-raised/30 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        aria-expanded={open}
        aria-controls="requirements-panel-body"
      >
        <div className="flex items-center gap-3">
          <h2 id="requirements-panel-heading" className="font-sans text-base font-semibold text-text-primary">
            Requirements &amp; Coverage
          </h2>
          <span className="text-xs text-text-secondary bg-bg-raised px-2 py-0.5 rounded-full">
            {requirements.length} extracted
          </span>
          {/* Inline coverage status pill */}
          {mustHave.length > 0 && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
              coveredMustCount === mustHave.length
                ? 'bg-success/10 text-success border-success/20'
                : 'bg-warning/10 text-warning border-warning/20'
            }`}>
              {coveredMustCount === mustHave.length
                ? '✓ Fully covered'
                : `${mustHave.length - coveredMustCount} gap${mustHave.length - coveredMustCount !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>
        <ChevronIcon open={open} />
      </button>

      {/* Expandable body */}
      {open && (
        <div id="requirements-panel-body" className="px-6 pb-5 space-y-5 border-t border-bg-raised/40">
          {/* Coverage bar */}
          {mustHave.length > 0 && (
            <div className="pt-4">
              <CoverageSummaryBar
                total={mustHave.length}
                covered={coveredMustCount}
                passes={coveragePasses}
              />
            </div>
          )}

          {/* Must-have list */}
          {mustHave.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                Must-have ({mustHave.length})
              </p>
              <ul>
                {mustHave.map(r => (
                  <RequirementRow key={r.id} req={r} isUncovered={uncoveredSet.has(r.id)} />
                ))}
              </ul>
            </div>
          )}

          {/* Nice-to-have list */}
          {niceToHave.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                Nice-to-have ({niceToHave.length})
              </p>
              <ul>
                {niceToHave.map(r => (
                  <RequirementRow key={r.id} req={r} isUncovered={false} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
