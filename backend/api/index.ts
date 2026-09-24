/**
 * Vercel serverless function entry point for the Express backend.
 * Now uses inlined shared package instead of workspace dependency.
 */
import 'dotenv/config';
import { connectDB } from '../src/db';
import app from '../src/app';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let isConnected = false;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers inline for production compatibility
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'https://prepkit.vercel.app',
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ].filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Log incoming request for debugging
  console.log('[vercel] Incoming request:', {
    method: req.method,
    url: req.url,
    path: req.url,
    headers: {
      origin: req.headers.origin,
      host: req.headers.host,
    },
  });

  try {
    // Connect to MongoDB once — reused across warm invocations
    if (!isConnected) {
      console.log('[vercel] Connecting to MongoDB...');
      await connectDB();
      isConnected = true;
      console.log('[vercel] MongoDB connected');
    }

    // Delegate to the Express app
    return app(req, res);
  } catch (error) {
    console.error('[vercel] Handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
