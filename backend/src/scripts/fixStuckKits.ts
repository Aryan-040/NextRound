/**
 * fixStuckKits.ts
 * One-time script to fix kits stuck in "generating" or "pending" status
 * when they actually have all their content generated.
 * 
 * A kit is considered "ready" if it has:
 * - At least one question
 * - At least one flashcard
 * - A populated company brief
 * - A populated role section
 */

import mongoose from 'mongoose';
import KitModel from '../models/Kit';
import { config } from '../config';

async function fixStuckKits() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');

    // Find all kits stuck in generating or pending status
    const stuckKits = await KitModel.find({
      status: { $in: ['generating', 'pending'] }
    });

    console.log(`Found ${stuckKits.length} kits with generating/pending status`);

    let fixedCount = 0;

    for (const kit of stuckKits) {
      // Check if kit actually has content (indicating it's complete)
      const hasQuestions = Array.isArray(kit.questions) && kit.questions.length > 0;
      const hasFlashcards = Array.isArray(kit.flashcards) && kit.flashcards.length > 0;
      const hasCompanyBrief = kit.company_brief?.summary && kit.company_brief.summary.length > 0;
      const hasRole = kit.role?.title && kit.role.title.length > 0;

      if (hasQuestions && hasFlashcards && hasCompanyBrief && hasRole) {
        // Kit is complete, update status to ready
        await KitModel.updateOne(
          { _id: kit._id },
          { $set: { status: 'ready' }, $unset: { pipelineError: 1 } }
        );
        
        console.log(`✓ Fixed kit ${kit._id} (${kit.source?.company} - ${kit.source?.role})`);
        fixedCount++;
      } else {
        console.log(`✗ Kit ${kit._id} is genuinely incomplete - skipping`);
        console.log(`  - Questions: ${hasQuestions}`);
        console.log(`  - Flashcards: ${hasFlashcards}`);
        console.log(`  - Company Brief: ${hasCompanyBrief}`);
        console.log(`  - Role: ${hasRole}`);
      }
    }

    console.log(`\nFixed ${fixedCount} out of ${stuckKits.length} stuck kits`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error fixing stuck kits:', error);
    process.exit(1);
  }
}

// Run the script
fixStuckKits();
