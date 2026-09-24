'use client';

/**
 * CreateForm — single-kit creation form.
 *
 * Contains three validated fields:
 *   1. JobDescriptionTextarea  — minimum 50 characters after trim (Req 2.4)
 *   2. CompanyUrlInput         — well-formed absolute HTTP/HTTPS URL (Req 2.2)
 *   3. DaysInput               — integer 1–60 inclusive (Req 2.3)
 *
 * Behaviour:
 *   - Client-side validation fires on submit; field-level errors appear
 *     adjacent to each field (Req 2.1).
 *   - On valid submit: POST /api/kits → returns { kitId }.
 *   - On 409 (duplicate): shows DuplicateKitModal with "Open existing kit"
 *     and "Create new kit" actions (Req 2.6).
 *   - On success: calls onKitCreated(kitId) so the parent can show the
 *     ProgressTracker and eventually redirect.
 */
import { useState, useId } from 'react';
import { Button, Input, Textarea } from '@/components/ui';
import { apiFetch, ApiError } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateKitPayload {
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
}

interface CreateKitResponse {
  kitId: string;
}

interface DuplicateKitInfo {
  _id: string;
  source: {
    role: string;
    company: string;
  };
  createdAt?: string;
}

interface DuplicateErrorBody {
  error: string;
  existingKit: DuplicateKitInfo;
}

export interface CreateFormProps {
  onKitCreated: (kitId: string) => void;
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface FormErrors {
  jobDescription?: string;
  companyUrl?: string;
  days?: string;
}

function validateForm(
  jobDescription: string,
  companyUrl: string,
  days: string
): FormErrors {
  const errors: FormErrors = {};

  if (jobDescription.trim().length < 50) {
    errors.jobDescription = 'Job description must be at least 50 characters.';
  }

  if (!companyUrl.trim()) {
    errors.companyUrl = 'Company URL is required.';
  } else {
    try {
      const parsed = new URL(companyUrl.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.companyUrl = 'URL must use the http or https scheme.';
      }
    } catch {
      errors.companyUrl = 'Please enter a valid URL (e.g. https://example.com).';
    }
  }

  const daysNum = Number(days);
  if (days.trim() === '' || !Number.isInteger(daysNum)) {
    errors.days = 'Days must be a whole number.';
  } else if (daysNum < 1 || daysNum > 60) {
    errors.days = 'Days must be between 1 and 60.';
  }

  return errors;
}

// ─── DuplicateKitModal ────────────────────────────────────────────────────────

interface DuplicateKitModalProps {
  kit: DuplicateKitInfo;
  onOpenExisting: () => void;
  onCreateNew: () => void;
}

function DuplicateKitModal({
  kit,
  onOpenExisting,
  onCreateNew,
}: DuplicateKitModalProps) {
  const headingId = useId();
  const descId = useId();

  const roleLabel = kit.source?.role ?? 'this role';
  const companyLabel = kit.source?.company ?? 'this company';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={descId}
    >
      <div className="relative w-full max-w-md mx-4 rounded-lg bg-bg-surface border border-border-default/50 p-6 shadow-xs-lg">
        {/* Icon */}
        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 border border-warning/20 text-warning shrink-0">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </span>
          <h2 id={headingId} className="font-heading font-semibold text-text-primary text-base">
            Duplicate kit detected
          </h2>
        </div>

        <p id={descId} className="text-sm text-text-secondary mb-6">
          You already have a kit for{' '}
          <span className="text-text-primary font-medium">{roleLabel}</span>{' '}
          at{' '}
          <span className="text-text-primary font-medium">{companyLabel}</span>
          . Would you like to open it or create a new one?
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="primary" size="md" onClick={onOpenExisting} className="flex-1">
            Open existing kit
          </Button>
          <Button variant="secondary" size="md" onClick={onCreateNew} className="flex-1">
            Create new kit
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── CreateForm ───────────────────────────────────────────────────────────────

export function CreateForm({ onKitCreated }: CreateFormProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [companyUrl, setCompanyUrl]         = useState('');
  const [days, setDays]                     = useState('');
  const [errors, setErrors]                 = useState<FormErrors>({});
  const [submitting, setSubmitting]         = useState(false);
  const [serverError, setServerError]       = useState<string | null>(null);

  const [duplicateKit, setDuplicateKit]     = useState<DuplicateKitInfo | null>(null);
  const [pendingPayload, setPendingPayload] = useState<CreateKitPayload | null>(null);

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
    forceCreate = false
  ) => {
    e.preventDefault();
    setServerError(null);

    const fieldErrors = validateForm(jobDescription, companyUrl, days);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    const payload: CreateKitPayload = {
      jobDescription: jobDescription.trim(),
      companyUrl: companyUrl.trim(),
      daysAvailable: Number(days),
    };

    setSubmitting(true);
    try {
      const res = await apiFetch<CreateKitResponse>('/kits', {
        method: 'POST',
        body: forceCreate ? { ...payload, forceCreate: true } : payload,
      });
      onKitCreated(res.kitId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          const token = (await import('@/lib/auth')).getToken();
          const rawRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/kits`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify(
                forceCreate ? { ...payload, forceCreate: true } : payload
              ),
            }
          );
          const body = (await rawRes.json()) as DuplicateErrorBody;
          if (body.existingKit) {
            setPendingPayload(payload);
            setDuplicateKit(body.existingKit);
          } else {
            setServerError(body.error ?? 'A duplicate kit already exists.');
          }
        } catch {
          setServerError('A duplicate kit already exists.');
        }
      } else if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenExisting = () => {
    if (duplicateKit) {
      window.location.href = `/kits/${duplicateKit._id}`;
    }
  };

  const handleCreateNew = async () => {
    setDuplicateKit(null);
    if (!pendingPayload) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await apiFetch<CreateKitResponse>('/kits', {
        method: 'POST',
        body: { ...pendingPayload, forceCreate: true },
      });
      onKitCreated(res.kitId);
    } catch (err) {
      setServerError(
        err instanceof ApiError ? err.message : 'Something went wrong.'
      );
    } finally {
      setSubmitting(false);
      setPendingPayload(null);
    }
  };

  return (
    <>
      {duplicateKit && (
        <DuplicateKitModal
          kit={duplicateKit}
          onOpenExisting={handleOpenExisting}
          onCreateNew={handleCreateNew}
        />
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-6"
        aria-label="Create new prep kit"
      >
        <Textarea
          label="Job description"
          id="job-description"
          placeholder="Paste the full job description here (minimum 50 characters)…"
          rows={10}
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          error={!!errors.jobDescription}
          errorMessage={errors.jobDescription}
          hint="Paste the complete job posting for the best results."
          disabled={submitting}
          required
          minLength={50}
        />

        <Input
          label="Company website"
          id="company-url"
          type="url"
          placeholder="https://example.com"
          value={companyUrl}
          onChange={(e) => setCompanyUrl(e.target.value)}
          error={!!errors.companyUrl}
          errorMessage={errors.companyUrl}
          hint="Enter the company's main website URL."
          disabled={submitting}
          required
        />

        <Input
          label="Days until interview"
          id="days"
          type="number"
          placeholder="e.g. 7"
          min={1}
          max={60}
          step={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          error={!!errors.days}
          errorMessage={errors.days}
          hint="How many days do you have to prepare? (1–60)"
          disabled={submitting}
          required
        />

        {serverError && (
          <p
            role="alert"
            className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2"
          >
            {serverError}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={submitting}
          disabled={submitting}
          className="self-start"
        >
          {submitting ? 'Creating kit…' : 'Generate prep kit'}
        </Button>
      </form>
    </>
  );
}
