/**
 * practice.ts
 * Express router for flashcard practice mode endpoints.
 *
 * GET  /api/kits/:id/practice/deck  — Return ordered deck of flashcard IDs for
 *                                     a practice session. Ordered by ascending
 *                                     meanConfidence (unseen cards treated as 0
 *                                     and appear first). Tiebreak: flashcard ID
 *                                     string sort.
 *
 * POST /api/kits/:id/practice/rate  — Record a confidence rating for one
 *                                     flashcard. Upserts FlashcardProgress,
 *                                     pushes the new rating, and recomputes the
 *                                     cached meanConfidence.
 *
 * All routes require a valid Bearer JWT (enforced by `authenticate` middleware).
 *
 * Requirements: 15.3, 15.6
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';

import { authenticate } from '../middleware/authenticate';
import KitModel from '../models/Kit';
import type { KitModelDocument } from '../models/Kit';
import FlashcardProgressModel from '../models/FlashcardProgress';
import { HttpError } from '../errors';

const router = Router({ mergeParams: true });

// ── Ownership helper ──────────────────────────────────────────────────────────

/**
 * Asserts that the given kit belongs to the authenticated user.
 * Throws HttpError(403) on mismatch.
 */
function assertKitOwner(kit: KitModelDocument, userId: string): void {
  if (!kit.userId.equals(userId)) {
    throw new HttpError(403, 'Forbidden');
  }
}

// ── Request body schemas ──────────────────────────────────────────────────────

const rateBodySchema = z.object({
  flashcardId: z.string().min(1, { message: 'flashcardId is required' }),
  confidence: z.union(
    [z.literal(1), z.literal(2), z.literal(3), z.literal(4)],
    { errorMap: () => ({ message: 'confidence must be 1, 2, 3, or 4' }) }
  ),
});

// ── GET /api/kits/:id/practice/deck ──────────────────────────────────────────

/**
 * Returns the ordered flashcard IDs for a practice session.
 *
 * Algorithm (Requirement 15.6):
 *  1. Load all flashcard IDs from the kit.
 *  2. Load all FlashcardProgress documents for (userId, kitId).
 *  3. Build a map: flashcardId → meanConfidence (default 0 for unseen cards).
 *  4. Sort by meanConfidence ASC; tiebreak by flashcardId string (lexicographic).
 *  5. Return { deck: string[] }.
 */
router.get(
  '/deck',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: kitId } = req.params;
      const userId = req.user!.userId;

      // 1. Load kit and verify ownership
      const kit = await KitModel.findById(kitId).select('userId flashcards');
      if (!kit) {
        return next(new HttpError(404, 'Kit not found'));
      }
      assertKitOwner(kit, userId);

      // 2. Get all flashcard IDs from the kit
      const flashcardIds: string[] = (kit.flashcards ?? []).map(
        (f: { id: string }) => f.id,
      );

      if (flashcardIds.length === 0) {
        // Empty deck — return empty array (Requirement 15.8 handled on frontend)
        res.json({ deck: [] });
        return;
      }

      // 3. Fetch FlashcardProgress documents for this user+kit pair
      const progressDocs = await FlashcardProgressModel.find({
        userId: new Types.ObjectId(userId),
        kitId:  new Types.ObjectId(kitId),
      })
        .select('flashcardId meanConfidence')
        .lean();

      // Build a lookup: flashcardId → meanConfidence
      const confidenceMap = new Map<string, number>();
      for (const doc of progressDocs) {
        confidenceMap.set(doc.flashcardId, doc.meanConfidence);
      }

      // 4. Sort: ascending meanConfidence (unseen = 0), tiebreak by ID string
      const sorted = [...flashcardIds].sort((a, b) => {
        const confA = confidenceMap.get(a) ?? 0;
        const confB = confidenceMap.get(b) ?? 0;
        if (confA !== confB) return confA - confB;
        // Lexicographic tiebreak on the ID string
        return a < b ? -1 : a > b ? 1 : 0;
      });

      // Build the set of flashcard IDs that have at least one prior rating
      // (meanConfidence > 0). Used by the frontend to show a "seen before"
      // badge on the DeckOrderIndicator.
      const coveredIds = progressDocs
        .filter(doc => doc.meanConfidence > 0)
        .map(doc => doc.flashcardId);

      res.json({ deck: sorted, coveredIds });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/kits/:id/practice/rate ─────────────────────────────────────────

/**
 * Records a confidence rating for a flashcard and updates the cached mean.
 *
 * Upsert logic (Requirement 15.3):
 *  1. Find or create a FlashcardProgress document for (userId, kitId, flashcardId).
 *  2. Push { confidence, ratedAt: new Date() } to the ratings array.
 *  3. Recompute meanConfidence as the arithmetic mean of ALL confidence values.
 *  4. Return { ok: true }.
 */
router.post(
  '/rate',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: kitId } = req.params;
      const userId = req.user!.userId;

      // 1. Validate request body
      const parsed = rateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = issue.path[0] as string | undefined;
        return next(new HttpError(400, issue.message, field));
      }

      const { flashcardId, confidence } = parsed.data;

      // 2. Load kit and verify ownership
      const kit = await KitModel.findById(kitId).select('userId flashcards');
      if (!kit) {
        return next(new HttpError(404, 'Kit not found'));
      }
      assertKitOwner(kit, userId);

      // 3. Verify the flashcard exists in this kit
      const flashcardExists = (kit.flashcards ?? []).some(
        (f: { id: string }) => f.id === flashcardId,
      );
      if (!flashcardExists) {
        return next(new HttpError(404, `Flashcard '${flashcardId}' not found in this kit`));
      }

      const ratedAt = new Date();
      const userObjectId = new Types.ObjectId(userId);
      const kitObjectId  = new Types.ObjectId(kitId);

      // 4. Upsert: push the new rating and recompute meanConfidence atomically.
      //
      //    We use findOneAndUpdate with upsert:true to either insert a new
      //    document or update an existing one in a single round-trip. After
      //    $push we retrieve the updated ratings array to recompute the mean,
      //    then write meanConfidence back. This two-step approach keeps the
      //    computation in application code (not delegated to MongoDB) for
      //    clarity and testability.
      //
      //    findOneAndUpdate returns the UPDATED document (new: true) so we can
      //    compute the mean from the full ratings array.
      const updated = await FlashcardProgressModel.findOneAndUpdate(
        { userId: userObjectId, kitId: kitObjectId, flashcardId },
        {
          $push: { ratings: { confidence, ratedAt } },
          // $setOnInsert ensures userId/kitId/flashcardId are set correctly on
          // a new document (upsert path). They are also part of the filter, so
          // Mongoose would set them anyway, but being explicit is safer.
          $setOnInsert: {
            userId: userObjectId,
            kitId:  kitObjectId,
            flashcardId,
          },
        },
        {
          new: true,       // return the document AFTER the update
          upsert: true,    // create if not found
          setDefaultsOnInsert: true,
        },
      );

      // 5. Recompute meanConfidence from all ratings (arithmetic mean)
      const allConfidenceValues = updated!.ratings.map(r => r.confidence);
      const mean =
        allConfidenceValues.reduce((sum, c) => sum + c, 0) /
        allConfidenceValues.length;

      updated!.meanConfidence = mean;
      await updated!.save();

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
