/**
 * kits.ts
 * Express router for kit management endpoints.
 *
 * POST   /api/kits          — validate inputs, check deduplication, create a Kit
 *                             document with status 'pending', fire-and-forget the
 *                             extraction pipeline, return { kitId }.
 * GET    /api/kits          — return the authenticated user's kits as a summary list.
 * GET    /api/kits/:id      — return full kit document (ownership verified).
 * PATCH  /api/kits/:id      — merge partial Kit fields; set pinned=true on edited
 *                             questions/flashcards; persist and return updated kit.
 * DELETE /api/kits/:id      — delete kit and all associated FlashcardProgress docs.
 * GET    /api/kits/:id/progress — SSE stream of StageEvents for the given kit.
 *
 * All routes require a valid Bearer JWT (enforced by `authenticate` middleware).
 *
 * Requirements: 2.1–2.6, 1.6, 11.2, 13.3, 13.4, 2.5
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { StageEvent } from '../services/extractionPipeline';

import { authenticate } from '../middleware/authenticate';
import KitModel from '../models/Kit';
import type { KitModelDocument } from '../models/Kit';
import FlashcardProgressModel from '../models/FlashcardProgress';
import { HttpError } from '../errors';
import {
  runPipeline,
  computeDedupeKey,
  generateCompanyBrief,
  generateQuestionsForCategory,
  generateFlashcards,
  runCoverageAndGapFill,
} from '../services/extractionPipeline';
import type { QuestionCategory } from '../services/extractionPipeline';
import { createLLMClient } from '../services/llmClient';
import { buildSchedule } from '../services/scheduler';
import type { CrawlerResult } from '../services/crawler';
import type { ResearchResult } from '../services/researchAgent';
import { pipelineEmitter } from '../events';

const router = Router();

// ── Ownership helper ──────────────────────────────────────────────────────────

/**
 * Asserts that the given kit belongs to the authenticated user.
 * Throws HttpError(403) on mismatch.
 *
 * @param kit    The loaded Mongoose Kit document.
 * @param userId The authenticated user's ID string (from req.user).
 */
function assertKitOwner(kit: KitModelDocument, userId: string): void {
  if (!kit.userId.equals(userId)) {
    throw new HttpError(403, 'Forbidden');
  }
}

// ── Request body schemas ──────────────────────────────────────────────────────

const createKitSchema = z.object({
  jobDescription: z
    .string()
    .transform(s => s.trim())
    .refine(s => s.length >= 50, {
      message: 'Job description must be at least 50 characters',
    }),
  companyUrl: z
    .string()
    .url({ message: 'Company URL must be a valid URL' })
    .refine(
      url => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'Company URL must use HTTP or HTTPS' },
    ),
  daysAvailable: z
    .number({ invalid_type_error: 'daysAvailable must be a number' })
    .int({ message: 'daysAvailable must be an integer' })
    .min(1, { message: 'daysAvailable must be at least 1' })
    .max(60, { message: 'daysAvailable must be at most 60' }),
  /**
   * When true, bypass the duplicate-kit check and create a new kit even if
   * an identical (userId, dedupeKey) pair already exists.  Used by the
   * "Create new kit" button in the DuplicateKitModal.
   */
  forceCreate: z.boolean().optional(),
});

// Zod schema for PATCH body — all top-level kit sections are optional.
// Questions and flashcards within arrays also carry optional fields so callers
// can send only the changed subset.
const requirementSchema = z.object({
  id:       z.string(),
  text:     z.string(),
  kind:     z.enum(['technical', 'behavioural', 'domain']),
  priority: z.enum(['must', 'nice']),
});

const questionPatchSchema = z.object({
  id:              z.string(),
  requirement_ids: z.array(z.string()).optional(),
  category:        z.enum(['technical', 'behavioural', 'system-design', 'company-fit']).optional(),
  prompt:          z.string().optional(),
  answer_outline:  z.string().optional(),
  difficulty:      z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  pinned:          z.boolean().optional(),
});

const flashcardPatchSchema = z.object({
  id:              z.string(),
  front:           z.string().optional(),
  back:            z.string().optional(),
  requirement_ids: z.array(z.string()).optional(),
  pinned:          z.boolean().optional(),
});

const patchKitSchema = z
  .object({
    source: z
      .object({
        company:       z.string(),
        company_url:   z.string(),
        role:          z.string(),
        location:      z.string(),
        jd_chars:      z.number(),
        researched_at: z.string(),
        pages_used:    z.array(z.string()),
      })
      .partial()
      .optional(),
    company_brief: z
      .object({
        summary:      z.string(),
        what_they_do: z.string(),
        sources:      z.array(z.string()),
      })
      .partial()
      .optional(),
    role: z
      .object({
        title:            z.string(),
        seniority:        z.string(),
        responsibilities: z.array(z.string()),
        requirements:     z.array(requirementSchema),
      })
      .partial()
      .optional(),
    questions:  z.array(questionPatchSchema).optional(),
    flashcards: z.array(flashcardPatchSchema).optional(),
    schedule: z
      .object({
        days_available: z.number(),
        days: z.array(
          z.object({
            day:          z.number(),
            focus:        z.string(),
            question_ids: z.array(z.string()),
            minutes:      z.number(),
          }),
        ),
      })
      .partial()
      .optional(),
    coverage: z
      .object({
        uncovered_requirement_ids: z.array(z.string()),
        passes:                    z.number(),
      })
      .partial()
      .optional(),
  })
  .strict();

// ── POST /api/kits ────────────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 1. Validate request body
    const parsed = createKitSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path[0] as string | undefined;
      return next(new HttpError(400, issue.message, field));
    }

    const { jobDescription, companyUrl, daysAvailable, forceCreate } = parsed.data;
    const userId = req.user!.userId;

    // 2. Compute deduplication fingerprint
    const dedupeKey = computeDedupeKey(jobDescription, companyUrl);

    // 3. Check for an existing kit with the same (userId, dedupeKey) pair
    //    unless forceCreate is set (user explicitly chose "Create new kit").
    if (!forceCreate) {
      const existingKit = await KitModel.findOne({ userId, dedupeKey }).select(
        '_id status source.role source.company createdAt',
      );

      if (existingKit) {
        res.status(409).json({
          error: 'A kit for this job description and company URL already exists.',
          existingKit: {
            id: existingKit._id.toString(),
            role: existingKit.source?.role ?? '',
            company: existingKit.source?.company ?? '',
            createdAt: existingKit.createdAt,
          },
        });
        return;
      }
    }

    // 4. Create the Kit document with status 'pending'.
    //    When forceCreate is true we append a random suffix to the dedupeKey
    //    so the unique index allows the duplicate creation.
    const effectiveDedupeKey = forceCreate
      ? `${dedupeKey}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : dedupeKey;
    let kit;
    try {
      kit = await KitModel.create({
        userId,
        dedupeKey: effectiveDedupeKey,
        status: 'pending',
        // Populate required nested fields with empty defaults so Mongoose
        // schema validation passes before the pipeline fills them in.
        source: {
          company: '',
          company_url: companyUrl,
          role: '',
          location: '',
          jd_chars: jobDescription.length,
          researched_at: '',
          pages_used: [],
        },
        company_brief: { summary: '', what_they_do: '', sources: [] },
        role: {
          title: '',
          seniority: '',
          responsibilities: [],
          requirements: [],
        },
        questions: [],
        flashcards: [],
        schedule: { days_available: daysAvailable, days: [] },
        coverage: { uncovered_requirement_ids: [], passes: 0 },
      });
    } catch (err: unknown) {
      // Race condition: another request created the same kit between our check
      // and this insert. Treat the duplicate-key error as a 409.
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 11000
      ) {
        const dup = await KitModel.findOne({ userId, dedupeKey: effectiveDedupeKey }).select(
          '_id status source.role source.company createdAt',
        );
        res.status(409).json({
          error: 'A kit for this job description and company URL already exists.',
          existingKit: dup
            ? {
                id: dup._id.toString(),
                role: dup.source?.role ?? '',
                company: dup.source?.company ?? '',
                createdAt: dup.createdAt,
              }
            : null,
        });
        return;
      }
      return next(err);
    }

    const kitId = kit._id.toString();

    // 5. Fire-and-forget the extraction pipeline
    //    Update status → 'generating' immediately, then 'ready' or 'failed'.
    setImmediate(() => {
      void (async () => {
        // Mark as generating
        await KitModel.updateOne({ _id: kit._id }, { $set: { status: 'generating' } });

        // Emit a synthetic 'pipeline running' event so SSE listeners see the
        // initial state transition before the first real stage fires.
        pipelineEmitter.emitStage(kitId, {
          stage: 'pipeline',
          status: 'running',
        });

        try {
          const generatedKit = await runPipeline({
            jobDescription,
            companyUrl,
            daysAvailable,
            onProgress: event => {
              pipelineEmitter.emitStage(kitId, event);
            },
          });

          // Persist the fully generated kit fields, including all pipeline output
          await KitModel.updateOne(
            { _id: kit._id },
            {
              $set: {
                status: 'ready',
                source: generatedKit.source,
                company_brief: generatedKit.company_brief,
                role: generatedKit.role,
                questions: generatedKit.questions,
                flashcards: generatedKit.flashcards,
                schedule: generatedKit.schedule,
                coverage: generatedKit.coverage,
              },
            },
          );

          pipelineEmitter.emitStage(kitId, {
            stage: 'pipeline',
            status: 'done',
          });
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'An unexpected error occurred.';

          console.error(`[kits] Pipeline failed for kit ${kitId}:`, err);

          await KitModel.updateOne(
            { _id: kit._id },
            {
              $set: {
                status: 'failed',
                pipelineError: message.slice(0, 1000), // cap stored error length
              },
            },
          );

          pipelineEmitter.emitStage(kitId, {
            stage: 'pipeline',
            status: 'failed',
            error: message,
          });
        }
      })();
    });

    // 6. Return immediately with the new kit's ID
    res.status(201).json({ kitId });
  },
);

// ── GET /api/kits ─────────────────────────────────────────────────────────────

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      // Return summary fields only — the full kit document is fetched via GET /api/kits/:id
      const kitsRaw = await KitModel.find({ userId })
        .select('_id status source.role source.company createdAt questions flashcards schedule')
        .sort({ createdAt: -1 })
        .lean();

      // Compute summary stats so the dashboard can show them without a
      // separate request per kit.
      const kits = kitsRaw.map((k: any) => ({
        _id: k._id,
        status: k.status,
        source: k.source,
        createdAt: k.createdAt,
        questionCount: Array.isArray(k.questions) ? k.questions.length : undefined,
        flashcardCount: Array.isArray(k.flashcards) ? k.flashcards.length : undefined,
        totalMinutes: k.schedule?.days
          ? (k.schedule.days as Array<{ minutes: number }>).reduce((s: number, d: { minutes: number }) => s + (d.minutes ?? 0), 0)
          : undefined,
        daysAvailable: k.schedule?.days_available,
      }));

      res.json(kits);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/kits/:id ─────────────────────────────────────────────────────────

router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const kit = await KitModel.findById(id);
      if (!kit) {
        return next(new HttpError(404, 'Kit not found'));
      }

      assertKitOwner(kit, userId);

      res.json(kit);
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /api/kits/:id ───────────────────────────────────────────────────────

router.patch(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      // 1. Load and verify ownership
      const kit = await KitModel.findById(id);
      if (!kit) {
        return next(new HttpError(404, 'Kit not found'));
      }
      assertKitOwner(kit, userId);

      // 2. Validate the partial patch body
      const parsed = patchKitSchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = issue.path.join('.') || undefined;
        return next(new HttpError(400, issue.message, field));
      }

      const patch = parsed.data;

      // 3. Merge question updates — mark every touched question as pinned.
      //    The caller sends at minimum the question id and the changed fields.
      //    We merge field-by-field so untouched fields are preserved.
      if (patch.questions) {
        for (const patchQ of patch.questions) {
          const existing = kit.questions.find(q => q.id === patchQ.id);
          if (existing) {
            if (patchQ.requirement_ids !== undefined) existing.requirement_ids = patchQ.requirement_ids;
            if (patchQ.category        !== undefined) existing.category        = patchQ.category;
            if (patchQ.prompt          !== undefined) existing.prompt          = patchQ.prompt;
            if (patchQ.answer_outline  !== undefined) existing.answer_outline  = patchQ.answer_outline;
            if (patchQ.difficulty      !== undefined) existing.difficulty      = patchQ.difficulty;
            // Always pin an edited question (Requirement 11.2)
            existing.pinned = true;
          } else {
            // New question added by the user — insert with pinned=true
            kit.questions.push({
              id:              patchQ.id,
              requirement_ids: patchQ.requirement_ids ?? [],
              category:        patchQ.category ?? 'technical',
              prompt:          patchQ.prompt ?? '',
              answer_outline:  patchQ.answer_outline ?? '',
              difficulty:      patchQ.difficulty ?? 1,
              pinned:          true,
            });
          }
        }
      }

      // 4. Merge flashcard updates — mark every touched flashcard as pinned.
      if (patch.flashcards) {
        for (const patchF of patch.flashcards) {
          const existing = kit.flashcards.find(f => f.id === patchF.id);
          if (existing) {
            if (patchF.front           !== undefined) existing.front           = patchF.front;
            if (patchF.back            !== undefined) existing.back            = patchF.back;
            if (patchF.requirement_ids !== undefined) existing.requirement_ids = patchF.requirement_ids;
            // Always pin an edited flashcard (Requirement 11.2)
            existing.pinned = true;
          } else {
            // New flashcard added by the user — skip if both sides are still
            // empty (user added a card but hasn't filled it in yet; saving an
            // empty card would fail Mongoose's required validator on front/back).
            const frontVal = patchF.front ?? '';
            const backVal  = patchF.back  ?? '';
            if (frontVal.trim() === '' && backVal.trim() === '') continue;
            kit.flashcards.push({
              id:              patchF.id,
              front:           frontVal,
              back:            backVal,
              requirement_ids: patchF.requirement_ids ?? [],
              pinned:          true,
            });
          }
        }
      }

      // 5. Merge remaining top-level sections (source, company_brief, role,
      //    schedule, coverage). Object.assign does a shallow merge so only the
      //    provided fields overwrite — others are preserved.
      if (patch.source)        Object.assign(kit.source,        patch.source);
      if (patch.company_brief) Object.assign(kit.company_brief, patch.company_brief);
      if (patch.role)          Object.assign(kit.role,          patch.role);
      if (patch.schedule)      Object.assign(kit.schedule,      patch.schedule);
      if (patch.coverage)      Object.assign(kit.coverage,      patch.coverage);

      // 6. Persist and return the updated document
      await kit.save();

      res.json(kit);
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /api/kits/:id ──────────────────────────────────────────────────────

router.delete(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      // 1. Load and verify ownership
      const kit = await KitModel.findById(id);
      if (!kit) {
        return next(new HttpError(404, 'Kit not found'));
      }
      assertKitOwner(kit, userId);

      // 2. Delete the kit document
      await KitModel.deleteOne({ _id: kit._id });

      // 3. Delete all FlashcardProgress records for this kit (Requirement 13.4)
      await FlashcardProgressModel.deleteMany({ kitId: kit._id });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /api/kits/:id/flashcards/:flashcardId ──────────────────────────────

router.delete(
  '/:id/flashcards/:flashcardId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, flashcardId } = req.params;
      const userId = req.user!.userId;

      const kit = await KitModel.findById(id);
      if (!kit) return next(new HttpError(404, 'Kit not found'));
      assertKitOwner(kit, userId);

      const before = kit.flashcards.length;
      kit.flashcards = kit.flashcards.filter((f: { id: string }) => f.id !== flashcardId) as typeof kit.flashcards;

      if (kit.flashcards.length === before) {
        return next(new HttpError(404, 'Flashcard not found'));
      }

      await kit.save();
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /api/kits/:id/questions/:questionId ────────────────────────────────

router.delete(
  '/:id/questions/:questionId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, questionId } = req.params;
      const userId = req.user!.userId;

      const kit = await KitModel.findById(id);
      if (!kit) return next(new HttpError(404, 'Kit not found'));
      assertKitOwner(kit, userId);

      const before = kit.questions.length;
      kit.questions = kit.questions.filter((q: { id: string }) => q.id !== questionId) as typeof kit.questions;

      if (kit.questions.length === before) {
        return next(new HttpError(404, 'Question not found'));
      }

      await kit.save();
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/kits/:id/progress (SSE) ─────────────────────────────────────────

router.get(
  '/:id/progress',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: kitId } = req.params;
      const userId = req.user!.userId;

      // Verify the kit exists and the caller owns it before opening the stream
      const kit = await KitModel.findById(kitId).select('_id userId status pipelineError');
      if (!kit) {
        return next(new HttpError(404, 'Kit not found'));
      }
      assertKitOwner(kit, userId);

      // Open SSE headers first
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const sendEvent = (event: StageEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.stage === 'pipeline' && (event.status === 'done' || event.status === 'failed')) {
          pipelineEmitter.off(kitId, sendEvent);
          res.end();
        }
      };

      // Subscribe to real events before we do anything else.
      pipelineEmitter.on(kitId, sendEvent);

      // Clean up on client disconnect
      req.on('close', () => {
        pipelineEmitter.off(kitId, sendEvent);
      });

      // Check if there's a pending regen job for this kit — if so, start it
      // NOW (after subscribing) so we can't miss any emitted events.
      const pendingJob = pendingRegenJobs.get(kitId);
      if (pendingJob) {
        pendingRegenJobs.delete(kitId);
        const { kit: regenKit, userId: regenUserId, section, snapshot } = pendingJob;
        setImmediate(() => {
          void regenerateSection(regenKit, kitId, regenUserId, section, snapshot);
        });
        return; // regen will emit pipeline:done when finished
      }

      // No pending job — if the kit is already in a terminal state, send the
      // synthetic final event now (fast-path for normal page-load polling).
      if (kit.status === 'ready' || kit.status === 'failed') {
        const finalEvent: StageEvent = {
          stage: 'pipeline',
          status: kit.status === 'ready' ? 'done' : 'failed',
          ...(kit.status === 'failed' && kit.pipelineError
            ? { error: kit.pipelineError }
            : {}),
        };
        sendEvent(finalEvent);
      }
      // If status is 'generating' and no pending job, a regen is already
      // running in-process — stay subscribed and wait for its events.
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/kits/:id/regenerate ─────────────────────────────────────────────

/**
 * The valid section identifiers for regeneration, matching design doc §Section Regeneration.
 */
const VALID_SECTIONS = [
  'company-brief',
  'questions-technical',
  'questions-behavioural',
  'questions-system-design',
  'questions-company-fit',
  'flashcards',
  'schedule',
] as const;

type RegenerateSection = (typeof VALID_SECTIONS)[number];

const regenerateBodySchema = z.object({
  section: z.enum(VALID_SECTIONS),
});

/**
 * Map a `questions-*` section name to its `QuestionCategory` value.
 */
const SECTION_TO_CATEGORY: Partial<Record<RegenerateSection, QuestionCategory>> = {
  'questions-technical':     'technical',
  'questions-behavioural':   'behavioural',
  'questions-system-design': 'system-design',
  'questions-company-fit':   'company-fit',
};

/**
 * Map a `questions-*` section name to its pipeline stage name for SSE events.
 */
const SECTION_TO_STAGE: Partial<Record<RegenerateSection, StageEvent['stage']>> = {
  'questions-technical':     'generate-questions-technical',
  'questions-behavioural':   'generate-questions-behavioural',
  'questions-system-design': 'generate-questions-system-design',
  'questions-company-fit':   'generate-questions-company-fit',
};

/**
 * Max questions per category regeneration call.
 * Matches the design doc: 2–5 per call; we target 5 (the ceiling) minus pinned count.
 */
const MAX_QUESTIONS_PER_CATEGORY = 5;

/**
 * Pending regeneration jobs keyed by kitId.
 * The POST /regenerate handler stores the job here; the SSE /progress
 * handler picks it up AFTER subscribing to the emitter, guaranteeing
 * that the subscription exists before any events are emitted.
 */
interface PendingRegenJob {
  kit: KitModelDocument;
  userId: string;
  section: RegenerateSection;
  snapshot: unknown;
}
const pendingRegenJobs = new Map<string, PendingRegenJob>();

router.post(
  '/:id/regenerate',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: kitId } = req.params;
      const userId = req.user!.userId;

      // ── 1. Validate request body ──────────────────────────────────────────
      const parsed = regenerateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return next(new HttpError(400, issue.message, 'section'));
      }
      const { section } = parsed.data;

      // ── 2. Load kit and verify ownership ─────────────────────────────────
      const kit = await KitModel.findById(kitId);
      if (!kit) {
        return next(new HttpError(404, 'Kit not found'));
      }
      assertKitOwner(kit, userId);

      // ── 3. Snapshot the relevant section for rollback on failure ──────────
      const snapshot = snapshotSection(kit, section);

      // ── 4. Mark kit as generating ─────────────────────────────────────────
      await KitModel.updateOne({ _id: kit._id }, { $set: { status: 'generating' } });
      kit.status = 'generating'; // keep in-memory copy in sync

      // ── 5. Store the job so the SSE endpoint can start it after subscribing
      pendingRegenJobs.set(kitId, { kit, userId, section, snapshot });

      // ── 6. Respond immediately — the SSE /progress connection will start work
      res.status(202).json({ ok: true, message: `Regenerating section: ${section}` });
    } catch (err) {
      next(err);
    }
  },
);

// ── Regeneration helpers ──────────────────────────────────────────────────────

/**
 * Deep-clone the section of the kit that will be overwritten, so we can
 * restore it exactly on failure (Requirement 14.6).
 */
function snapshotSection(
  kit: KitModelDocument,
  section: RegenerateSection,
): unknown {
  if (section === 'company-brief') {
    return JSON.parse(JSON.stringify(kit.company_brief));
  }
  if (section === 'schedule') {
    return JSON.parse(JSON.stringify(kit.schedule));
  }
  if (section === 'flashcards') {
    return JSON.parse(JSON.stringify(kit.flashcards));
  }
  // Question category: snapshot the full questions array (we only replace
  // non-pinned items in the named category).
  return JSON.parse(JSON.stringify(kit.questions));
}

/**
 * Apply a snapshot back to the kit when regeneration fails, persisting the
 * restored content to MongoDB.
 */
async function restoreSnapshot(
  kit: KitModelDocument,
  section: RegenerateSection,
  snapshot: unknown,
): Promise<void> {
  const field =
    section === 'company-brief' ? 'company_brief' :
    section === 'schedule'      ? 'schedule'       :
    section === 'flashcards'    ? 'flashcards'     : 'questions';

  await KitModel.findByIdAndUpdate(kit._id, {
    $set: { [field]: snapshot, status: 'ready' },
  });
}

/**
 * Derive the next available numeric suffix for a question ID.
 * e.g. if questions have ids "q1", "q3", "q7", returns 8.
 */
function nextQuestionIdNum(questions: Array<{ id: string }>): number {
  return questions.reduce((max, q) => {
    const num = parseInt(q.id.replace(/^q/, ''), 10);
    return isNaN(num) ? max : Math.max(max, num);
  }, 0) + 1;
}

/**
 * Core regeneration logic — runs asynchronously after the HTTP response is sent.
 *
 * Handles three distinct cases:
 *  - company-brief: re-run Call B with stored source data (no re-crawl)
 *  - schedule: re-run `buildSchedule` with current questions
 *  - questions-*: partition pinned/non-pinned, run Call C_n, re-run coverage, rebuild schedule
 *
 * Emits SSE StageEvents throughout so the client can show live progress.
 * On any error: restores the snapshot and emits a failure event.
 */
async function regenerateSection(
  kit: KitModelDocument,
  kitId: string,
  _userId: string,
  section: RegenerateSection,
  snapshot: unknown,
): Promise<void> {
  const emit = (event: StageEvent) => pipelineEmitter.emitStage(kitId, event);
  console.log(`[kits] Starting regeneration of "${section}" for kit ${kitId}`);

  try {
    const llm = await createLLMClient();
    console.log(`[kits] LLM client created for kit ${kitId}`);
    const requirements = kit.role.requirements as Array<{
      id: string; text: string; kind: 'technical' | 'behavioural' | 'domain'; priority: 'must' | 'nice';
    }>;

    // ── Schedule regeneration ─────────────────────────────────────────────
    if (section === 'schedule') {
      emit({ stage: 'schedule', status: 'running' });

      const newSchedule = buildSchedule(
        kit.questions as Parameters<typeof buildSchedule>[0],
        requirements as Parameters<typeof buildSchedule>[1],
        kit.schedule.days_available,
      );

      kit.schedule = newSchedule as typeof kit.schedule;
      kit.status = 'ready';
      await KitModel.findByIdAndUpdate(kit._id, {
        $set: { schedule: newSchedule, status: 'ready' },
      });

      emit({ stage: 'schedule', status: 'done' });
      emit({ stage: 'pipeline', status: 'done' });
      return;
    }

    // ── Company-brief regeneration ────────────────────────────────────────
    if (section === 'company-brief') {
      emit({ stage: 'company-brief', status: 'running' });

      // Build minimal CrawlerResult from stored kit data — we don't re-crawl.
      const mockCrawlResult: CrawlerResult = {
        pages: [],            // we don't have cached page content; the brief regenerates from sources list
        sourcesUsed: kit.source.pages_used ?? [],
        failures: [],
      };

      // Build minimal ResearchResult — no re-search on regeneration.
      const mockResearchResult: ResearchResult = {
        passages: [],
        sources: [],
        found: false,
      };

      // Use the company name from the URL if the stored name looks like a subdomain slug.
      const briefCompanyName = kit.source.company && kit.source.company.length > 3
        ? kit.source.company
        : (() => {
            try {
              const u = new URL(kit.source.company_url ?? '');
              return u.hostname.replace(/^www\d*\./i, '').split('.')[0] ?? kit.source.company;
            } catch { return kit.source.company; }
          })();

      const newBrief = await generateCompanyBrief(
        llm,
        briefCompanyName,
        mockCrawlResult,
        mockResearchResult,
      );

      kit.company_brief = newBrief as typeof kit.company_brief;
      kit.status = 'ready';
      await KitModel.findByIdAndUpdate(kit._id, {
        $set: { company_brief: newBrief, status: 'ready' },
      });

      emit({ stage: 'company-brief', status: 'done' });
      emit({ stage: 'pipeline', status: 'done' });
      return;
    }

    // ── Flashcards regeneration ───────────────────────────────────────────
    if (section === 'flashcards') {
      emit({ stage: 'generate-flashcards', status: 'running' });

      // Pinned flashcards are preserved; only non-pinned ones are replaced.
      const currentFlashcards = kit.flashcards as Array<{
        id: string;
        front: string;
        back: string;
        requirement_ids: string[];
        pinned: boolean;
      }>;

      const pinnedFlashcards    = currentFlashcards.filter(f => f.pinned);
      const nonPinnedFlashcards = currentFlashcards.filter(f => !f.pinned);

      // Compute ID offset so new IDs don't collide with existing ones.
      const maxExistingId = nonPinnedFlashcards.reduce((max, f) => {
        const num = parseInt(f.id.replace(/^f/, ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, pinnedFlashcards.reduce((max, f) => {
        const num = parseInt(f.id.replace(/^f/, ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0));

      const newFlashcards = await generateFlashcards(
        llm,
        requirements as Parameters<typeof generateFlashcards>[1],
        kit.questions as Parameters<typeof generateFlashcards>[2],
        maxExistingId,
      );

      // Merge: pinned (preserved) + newly generated (replacing non-pinned).
      const mergedFlashcards = [
        ...pinnedFlashcards,
        ...newFlashcards,
      ];

      await KitModel.findByIdAndUpdate(kit._id, {
        $set: { flashcards: mergedFlashcards, status: 'ready' },
      });

      emit({ stage: 'generate-flashcards', status: 'done' });
      emit({ stage: 'pipeline', status: 'done' });
      return;
    }

    // ── Question-category regeneration ────────────────────────────────────
    const category = SECTION_TO_CATEGORY[section]!;
    const stage    = SECTION_TO_STAGE[section]!;

    emit({ stage, status: 'running' });

    // Partition: pinned questions in this category are preserved.
    const currentQuestions = kit.questions as Array<{
      id: string;
      requirement_ids: string[];
      category: string;
      prompt: string;
      answer_outline: string;
      difficulty: number;
      pinned: boolean;
    }>;

    const pinnedInCategory    = currentQuestions.filter(q => q.category === category && q.pinned);
    const nonPinnedInCategory = currentQuestions.filter(q => q.category === category && !q.pinned);
    const otherQuestions      = currentQuestions.filter(q => q.category !== category);

    // How many new questions to request: fill remaining slots after pinned.
    const targetCount = Math.max(1, MAX_QUESTIONS_PER_CATEGORY - pinnedInCategory.length);

    // Determine ID offset: new IDs continue from max existing ID number + 1.
    const idOffset = nextQuestionIdNum(currentQuestions) - 1; // generateQuestionsForCategory adds +1

    // Call the appropriate LLM Call C_n.
    const newQuestions = await generateQuestionsForCategory(
      llm,
      category,
      requirements as Parameters<typeof generateQuestionsForCategory>[2],
      [],                  // no research passages on regeneration
      null,                // no dominant hiring signal
      targetCount,
      idOffset,
    );

    emit({ stage, status: 'done' });

    // Merge: pinned questions (original relative order) + newly generated ones.
    const mergedCategoryQuestions = [
      ...pinnedInCategory,
      ...newQuestions,
    ] as typeof currentQuestions;

    // Re-assemble full questions array: other categories + merged category.
    const allQuestions = [
      ...otherQuestions,
      ...mergedCategoryQuestions,
    ] as typeof currentQuestions;

    // Re-run coverage + gap-fill with the updated question set.
    const {
      questions: finalQuestions,
      uncoveredIds,
      passes: coveragePasses,
    } = await runCoverageAndGapFill(
      llm,
      requirements as Parameters<typeof runCoverageAndGapFill>[1],
      allQuestions as Parameters<typeof runCoverageAndGapFill>[2],
      emit,
    );

    // Rebuild schedule with the updated questions.
    emit({ stage: 'schedule', status: 'running' });
    const newSchedule = buildSchedule(
      finalQuestions as Parameters<typeof buildSchedule>[0],
      requirements as Parameters<typeof buildSchedule>[1],
      kit.schedule.days_available,
    );
    emit({ stage: 'schedule', status: 'done' });

    // Persist all updated sections.
    await KitModel.findByIdAndUpdate(kit._id, {
      $set: {
        questions: finalQuestions,
        schedule: newSchedule,
        coverage: { uncovered_requirement_ids: uncoveredIds, passes: coveragePasses },
        status: 'ready',
      },
    });

    emit({ stage: 'pipeline', status: 'done' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kits] Regeneration of "${section}" failed for kit ${kitId}:`, err);

    // Restore the snapshotted section and kit status before notifying the client.
    try {
      await restoreSnapshot(kit, section, snapshot);
    } catch (restoreErr) {
      // If restore fails, at least reset the status so the kit isn't stuck as 'generating'.
      await KitModel.updateOne({ _id: kit._id }, { $set: { status: 'ready' } }).catch(() => {});
      console.error(`[kits] Failed to restore snapshot for kit ${kitId}:`, restoreErr);
    }

    // Determine which stage to mark as failed for the SSE client.
    const failedStage: StageEvent['stage'] =
      section === 'schedule'
        ? 'schedule'
        : section === 'company-brief'
        ? 'company-brief'
        : section === 'flashcards'
        ? 'generate-flashcards'
        : (SECTION_TO_STAGE[section] ?? 'pipeline');

    pipelineEmitter.emitStage(kitId, { stage: failedStage, status: 'failed', error: message });
    pipelineEmitter.emitStage(kitId, {
      stage: 'pipeline',
      status: 'failed',
      error: `Section regeneration failed: ${message}`,
    });
  }
}

export default router;
