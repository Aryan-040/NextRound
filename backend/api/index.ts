/**
 * Vercel serverless function entry point for the Express backend.
 * Wraps the Express app to work with Vercel's serverless environment.
 */
import 'dotenv/config';
import { connectDB } from '../src/db';
import app from '../src/app';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let isConnected = false;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Get the origin from the request
  const origin = req.headers.origin || req.headers.referer || '*';
  
  // Set CORS headers dynamically based on request origin
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Connect to MongoDB once (connection is reused across invocations)
    if (!isConnected) {
      await connectDB();
      isConnected = true;
    }

    // Pass the request to Express
    return app(req, res);
  } catch (error) {
    console.error('[vercel] Handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
