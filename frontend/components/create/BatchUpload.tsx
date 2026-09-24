'use client';

/**
 * BatchUpload — file-based batch kit creation (Requirement 3.1–3.5).
 *
 * Sections:
 *   FileDropZone   — drag-and-drop or click-to-browse for a JSON file.
 *   BatchProgressTable — per-case status rows updated in real-time as each
 *                        case is processed sequentially.
 *   BatchSummary   — success/failure counts shown when all cases complete.
 *
 * Batch input schema (each element of the JSON array):
 *   { id: string; jd: string; company_url: string; days: number }
 *
 * Processing behaviour:
 *   1. Parse file → validate schema → reject with descriptive error on failure.
 *   2. For each case in order:
 *        a. POST /api/kits → receive { kitId }
 *        b. Open SSE on /api/kits/:id/progress; update that row in real-time.
 *        c. On 'complete' → mark row green "Ready".
 *        d. On error or 'failed' stage → mark row red with message.
 *   3. After all cases processed, show summary banner.
 */

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type DragEvent,
  type ChangeEvent,
} from 'react';
import { Badge, Button, Spinner } from '@/components/ui';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  type StageEvent,
  type PipelineStage,
} from '@/lib/sse';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// ─── Types ────────────────────────────────────────────────────────────────────

/** One element of the uploaded JSON array. */
interface BatchCase {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

/** Runtime status for a single batch row. */
type RowStatus = 'queued' | 'running' | 'ready' | 'failed';

interface BatchRow {
  /** User-provided identifier from the input file. */
  caseId: string;
  status: RowStatus;
  /** Backend-assigned kit ID once POST /api/kits succeeds. */
  kitId: string | null;
  /** Human-readable error message when status === 'failed'. */
  errorMessage: string | null;
  /** Latest per-stage SSE events while this case is running. */
  stages: Record<string, StageEvent>;
  /** The current running stage label (while status === 'running'). */
  currentStage: string | null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface ValidationError {
  index?: number;
  field?: string;
  message: string;
}

/**
 * Validate a parsed JSON value against the batch input schema.
 * Returns null if valid, or a descriptive error message.
 */
function validateBatchInput(data: unknown): ValidationError | null {
  if (!Array.isArray(data)) {
    return { message: 'The file must contain a JSON array at the top level.' };
  }
  if (data.length === 0) {
    return { message: 'The array is empty — add at least one case object.' };
  }

  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return {
        index: i,
        message: `Item [${i}] is not an object.`,
      };
    }

    const obj = item as Record<string, unknown>;

    if (!('id' in obj) || typeof obj.id !== 'string' || obj.id.trim() === '') {
      return {
        index: i,
        field: 'id',
        message: `Item [${i}] is missing a non-empty string "id" field.`,
      };
    }
    if (!('jd' in obj) || typeof obj.jd !== 'string' || obj.jd.trim() === '') {
      return {
        index: i,
        field: 'jd',
        message: `Item [${i}] is missing a non-empty string "jd" field.`,
      };
    }
    if (
      !('company_url' in obj) ||
      typeof obj.company_url !== 'string' ||
      obj.company_url.trim() === ''
    ) {
      return {
        index: i,
        field: 'company_url',
        message: `Item [${i}] is missing a non-empty string "company_url" field.`,
      };
    }

    // Validate company_url is a well-formed absolute HTTP/HTTPS URL.
    try {
      const parsed = new URL((obj.company_url as string).trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          index: i,
          field: 'company_url',
          message: `Item [${i}]: "company_url" must use the http or https scheme.`,
        };
      }
    } catch {
      return {
        index: i,
        field: 'company_url',
        message: `Item [${i}]: "company_url" is not a valid URL.`,
      };
    }

    if (!('days' in obj) || typeof obj.days !== 'number') {
      return {
        index: i,
        field: 'days',
        message: `Item [${i}]: "days" must be a number.`,
      };
    }
    if (!Number.isInteger(obj.days) || obj.days < 1 || obj.days > 60) {
      return {
        index: i,
        field: 'days',
        message: `Item [${i}]: "days" must be an integer between 1 and 60.`,
      };
    }
  }

  return null;
}

// ─── FileDropZone ─────────────────────────────────────────────────────────────

interface FileDropZoneProps {
  onFileAccepted: (file: File) => void;
  disabled: boolean;
}

function FileDropZone({ onFileAccepted, disabled }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const processFile = useCallback(
    (file: File) => {
      if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        // Surface a soft error without propagating an invalid file.
        return;
      }
      onFileAccepted(file);
    },
    [onFileAccepted]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [disabled, processFile]
  );

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDraggingOver(true);
  };

  const handleDragLeave = () => setIsDraggingOver(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so the same file can be re-uploaded.
    e.target.value = '';
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload JSON batch file"
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          inputRef.current?.click();
        }
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={[
        'relative flex flex-col items-center justify-center gap-3',
        'rounded-lg border-2 border-dashed px-6 py-10',
        'cursor-pointer select-none transition-colors duration-150',
        isDraggingOver
          ? 'border-accent bg-accent-dim/20'
          : 'border-border-default hover:border-accent/60 hover:bg-bg-surface',
        disabled ? 'pointer-events-none opacity-50' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Upload icon */}
      <svg
        className={`h-8 w-8 ${isDraggingOver ? 'text-accent' : 'text-text-secondary'}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>

      <div className="text-center">
        <p className="text-sm font-medium text-text-primary">
          Drop a JSON file here, or click to browse
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          Accepts JSON arrays of batch cases — .json files only
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleChange}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Row status icon ──────────────────────────────────────────────────────────

function RowStatusIcon({ status }: { status: RowStatus }) {
  switch (status) {
    case 'running':
      return <Spinner size="sm" label="Processing…" />;
    case 'ready':
      return (
        <svg
          className="h-4 w-4 text-success shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
            clipRule="evenodd"
          />
        </svg>
      );
    case 'failed':
      return (
        <svg
          className="h-4 w-4 text-danger shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      );
    default: // queued
      return (
        <span className="h-4 w-4 flex items-center justify-center shrink-0">
          <span className="h-2 w-2 rounded-full bg-bg-raised border border-bg-surface" />
        </span>
      );
  }
}

// ─── StageMiniList — compact inline stage progress for a running row ──────────

interface StageMiniListProps {
  stages: Record<string, StageEvent>;
  currentStage: string | null;
}

function StageMiniList({ stages, currentStage }: StageMiniListProps) {
  if (!currentStage) return null;
  const label = STAGE_LABELS[currentStage] ?? currentStage;

  return (
    <span className="text-xs text-text-secondary truncate">
      {label}…
    </span>
  );
}

// ─── BatchProgressTable ───────────────────────────────────────────────────────

interface BatchProgressTableProps {
  rows: BatchRow[];
}

function BatchProgressTable({ rows }: BatchProgressTableProps) {
  return (
    <div
      className="rounded-lg border border-bg-raised overflow-hidden"
      role="region"
      aria-label="Batch processing progress"
      aria-live="polite"
    >
      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_2fr] gap-3 px-4 py-2 bg-bg-raised/60 border-b border-bg-raised">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Case ID
        </span>
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Status
        </span>
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Progress / Result
        </span>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-bg-raised/50">
        {rows.map((row) => (
          <li
            key={row.caseId}
            className={[
              'grid grid-cols-[1fr_auto_2fr] gap-3 items-center px-4 py-3',
              row.status === 'ready'
                ? 'bg-success/10'
                : row.status === 'failed'
                ? 'bg-danger/10'
                : row.status === 'running'
                ? 'bg-accent-dim/10'
                : 'bg-transparent',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {/* Case ID */}
            <span
              className="text-sm font-mono text-text-primary truncate"
              title={row.caseId}
            >
              {row.caseId}
            </span>

            {/* Status badge + icon */}
            <span className="flex items-center gap-2">
              <RowStatusIcon status={row.status} />
              <Badge
                variant={
                  row.status === 'ready'
                    ? 'success'
                    : row.status === 'failed'
                    ? 'danger'
                    : row.status === 'running'
                    ? 'accent'
                    : 'muted'
                }
              >
                {row.status === 'queued'
                  ? 'Queued'
                  : row.status === 'running'
                  ? 'Running'
                  : row.status === 'ready'
                  ? 'Ready'
                  : 'Failed'}
              </Badge>
            </span>

            {/* Progress detail */}
            <span className="text-sm">
              {row.status === 'running' && (
                <StageMiniList
                  stages={row.stages}
                  currentStage={row.currentStage}
                />
              )}
              {row.status === 'ready' && row.kitId && (
                <a
                  href={`/kits/${row.kitId}`}
                  className="text-accent hover:underline text-xs font-medium"
                >
                  Open kit →
                </a>
              )}
              {row.status === 'failed' && (
                <span className="text-xs text-danger">
                  {row.errorMessage ?? 'Pipeline error.'}
                </span>
              )}
              {row.status === 'queued' && (
                <span className="text-xs text-text-secondary">Waiting…</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── BatchSummary ─────────────────────────────────────────────────────────────

interface BatchSummaryProps {
  succeeded: number;
  failed: number;
  total: number;
}

function BatchSummary({ succeeded, failed, total }: BatchSummaryProps) {
  const allSucceeded = failed === 0;
  const allFailed = succeeded === 0;

  return (
    <div
      role="alert"
      className={[
        'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium',
        allSucceeded
          ? 'border-success/30 bg-success/10 text-success'
          : allFailed
          ? 'border-danger/30 bg-danger/10 text-danger'
          : 'border-warning/30 bg-warning/10 text-warning',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Icon */}
      {allSucceeded ? (
        <svg
          className="h-5 w-5 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          className="h-5 w-5 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
      )}

      <span>
        Batch complete —{' '}
        <strong>
          {succeeded} of {total}
        </strong>{' '}
        kit{total !== 1 ? 's' : ''} generated successfully
        {failed > 0 && (
          <>, {failed} failed</>
        )}
        .
      </span>
    </div>
  );
}

// ─── BatchUpload (main export) ────────────────────────────────────────────────

export interface BatchUploadProps {
  /** Called once for each successfully created kit. */
  onKitCreated?: (kitId: string) => void;
}

/**
 * BatchUpload — complete batch kit creation workflow.
 *
 * Phases:
 *   'idle'       — show FileDropZone and descriptive hint text.
 *   'preview'    — show parsed case count + Start button; allow re-upload.
 *   'processing' — show BatchProgressTable with live SSE updates.
 *   'done'       — show BatchProgressTable (frozen) + BatchSummary.
 */
type BatchPhase = 'idle' | 'preview' | 'processing' | 'done';

export function BatchUpload({ onKitCreated }: BatchUploadProps) {
  const [phase, setPhase] = useState<BatchPhase>('idle');
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [cases, setCases] = useState<BatchCase[]>([]);
  const [rows, setRows] = useState<BatchRow[]>([]);

  // Ref to control the sequential processing loop; allows cleanup on unmount.
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // ── File accepted callback ─────────────────────────────────────────────────

  const handleFileAccepted = useCallback(async (file: File) => {
    setParseError(null);

    let rawText: string;
    try {
      rawText = await file.text();
    } catch {
      setParseError('Could not read the file. Please try again.');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (err: unknown) {
      const message =
        err instanceof SyntaxError ? err.message : 'Invalid JSON syntax.';
      setParseError(`JSON parse error: ${message}`);
      return;
    }

    const validationError = validateBatchInput(parsed);
    if (validationError) {
      setParseError(validationError.message);
      return;
    }

    const batchCases = parsed as BatchCase[];
    setFileName(file.name);
    setCases(batchCases);
    setPhase('preview');
  }, []);

  // ── Start processing ───────────────────────────────────────────────────────

  const handleStart = async () => {
    if (cases.length === 0) return;

    cancelledRef.current = false;

    // Initialise all rows as queued.
    const initialRows: BatchRow[] = cases.map((c) => ({
      caseId: c.id,
      status: 'queued',
      kitId: null,
      errorMessage: null,
      stages: {},
      currentStage: null,
    }));
    setRows(initialRows);
    setPhase('processing');

    // Process sequentially.
    for (let i = 0; i < cases.length; i++) {
      if (cancelledRef.current) break;

      const c = cases[i];

      // Mark this row as running.
      setRows((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: 'running' };
        return next;
      });

      // ── 1. POST /api/kits ─────────────────────────────────────────────────
      let kitId: string;
      try {
        const res = await apiFetch<{ kitId: string }>('/kits', {
          method: 'POST',
          body: {
            jobDescription: c.jd,
            companyUrl: c.company_url,
            daysAvailable: c.days,
          },
        });
        kitId = res.kitId;
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : 'Failed to create kit — check your connection.';
        setRows((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: 'failed',
            errorMessage: message,
            currentStage: null,
          };
          return next;
        });
        // Req 3.4: failure in one case does not abort remaining cases.
        continue;
      }

      // Store the kitId immediately so the row can link to it on success.
      setRows((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], kitId };
        return next;
      });

      // ── 2. Open SSE stream for progress ───────────────────────────────────
      const success = await waitForProgress({
        kitId,
        onStageEvent: (event) => {
          if (cancelledRef.current) return;
          setRows((prev) => {
            const next = [...prev];
            const row = { ...next[i] };
            row.stages = { ...row.stages, [event.stage]: event };
            if (event.status === 'running') {
              row.currentStage = event.stage;
            } else if (event.status === 'failed') {
              // Capture the error message from any failed stage event
              row.errorMessage = event.error ?? `Stage "${event.stage}" failed.`;
            } else if (event.status === 'done' && row.currentStage === event.stage) {
              // Advance currentStage label to give visual feedback.
              const idx = PIPELINE_STAGES.indexOf(event.stage as PipelineStage);
              const next_stage = PIPELINE_STAGES[idx + 1];
              row.currentStage = next_stage ?? null;
            }
            next[i] = row;
            return next;
          });
        },
      });

      if (cancelledRef.current) break;

      if (success) {
        setRows((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: 'ready',
            currentStage: null,
          };
          return next;
        });
        onKitCreated?.(kitId);
      } else {
        setRows((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: 'failed',
            errorMessage: next[i].errorMessage ?? 'Pipeline failed.',
            currentStage: null,
          };
          return next;
        });
      }
    }

    if (!cancelledRef.current) {
      setPhase('done');
    }
  };

  // ── Reset / re-upload ──────────────────────────────────────────────────────

  const handleReset = () => {
    setPhase('idle');
    setParseError(null);
    setFileName(null);
    setCases([]);
    setRows([]);
    cancelledRef.current = true;
  };

  // ── Derived summary counts (only meaningful in 'done' phase) ───────────────

  const succeeded = rows.filter((r) => r.status === 'ready').length;
  const failed = rows.filter((r) => r.status === 'failed').length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* Schema hint — always visible */}
      <div className="rounded-md bg-bg-surface border border-bg-raised px-4 py-3">
        <p className="text-xs font-medium text-text-secondary mb-1.5">
          Expected file format
        </p>
        <pre className="text-xs font-mono text-text-primary/80 whitespace-pre-wrap leading-relaxed">
          {`[
  {
    "id": "case-1",
    "jd": "Senior Software Engineer…",
    "company_url": "https://example.com",
    "days": 7
  }
]`}
        </pre>
      </div>

      {/* Phase: idle — show drop zone */}
      {(phase === 'idle' || phase === 'preview') && (
        <>
          <FileDropZone
            onFileAccepted={handleFileAccepted}
            disabled={false}
          />

          {/* Parse error */}
          {parseError && (
            <p
              role="alert"
              className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2"
            >
              {parseError}
            </p>
          )}

          {/* Preview: file loaded, ready to start */}
          {phase === 'preview' && !parseError && (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-accent/30 bg-accent-dim/10 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* File icon */}
                <svg
                  className="h-5 w-5 text-accent shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {fileName}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {cases.length} case{cases.length !== 1 ? 's' : ''} ready to
                    process
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  aria-label="Remove file and start over"
                >
                  Remove
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStart}
                >
                  Start →
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Phase: processing / done — show progress table */}
      {(phase === 'processing' || phase === 'done') && rows.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {phase === 'processing'
                ? `Processing ${cases.length} case${cases.length !== 1 ? 's' : ''}…`
                : `Processed ${rows.length} case${rows.length !== 1 ? 's' : ''}`}
            </h3>
            {phase === 'done' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReset}
              >
                Upload another file
              </Button>
            )}
          </div>

          <BatchProgressTable rows={rows} />

          {/* Summary banner (done phase only) */}
          {phase === 'done' && (
            <BatchSummary
              succeeded={succeeded}
              failed={failed}
              total={rows.length}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── waitForProgress helper ───────────────────────────────────────────────────

/**
 * Open an SSE connection to `/api/kits/:id/progress` and resolve when the
 * pipeline reaches 'complete' (true) or 'failed' (false).
 *
 * Calls `onStageEvent` for each intermediate stage update so the caller can
 * reflect progress in the UI.
 */
function waitForProgress({
  kitId,
  onStageEvent,
}: {
  kitId: string;
  onStageEvent: (event: StageEvent) => void;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const token = getToken();
    const url = new URL(`${API_BASE}/kits/${encodeURIComponent(kitId)}/progress`);
    if (token) url.searchParams.set('token', token);

    const es = new EventSource(url.toString());

    const cleanup = () => {
      es.close();
    };

    es.onmessage = (event: MessageEvent<string>) => {
      let parsed: StageEvent;
      try {
        parsed = JSON.parse(event.data) as StageEvent;
      } catch {
        return;
      }

      const { stage, status } = parsed;

      // Backend emits stage:'pipeline' status:'done' as the terminal success event.
      if (stage === 'pipeline' && status === 'done') {
        cleanup();
        resolve(true);
        return;
      }

      // Backend emits stage:'pipeline' status:'failed' on pipeline error.
      if (stage === 'pipeline' && status === 'failed') {
        cleanup();
        resolve(false);
        return;
      }

      onStageEvent(parsed);
    };

    es.onerror = () => {
      cleanup();
      resolve(false);
    };
  });
}
