/**
 * Vercel serverless function entry point for the Express backend.
 * Uses bundle:true in vercel.json so esbuild inlines all workspace
 * dependencies (including @interview-prep/shared) at build time.
 */
import { connectDB } from '../src/db';
import app from '../src/app';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let isConnected = false;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Connect to MongoDB once — reused across warm invocations
    if (!isConnected) {
      await connectDB();
      isConnected = true;
    }

    // Delegate to the Express app
    return app(req as any, res as any);
  } catch (error) {
    console.error('[vercel] Handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}