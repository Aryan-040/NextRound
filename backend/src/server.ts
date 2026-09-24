import 'dotenv/config';

/**
 * server.ts
 * Entry point for the Express server.
 * Connects to MongoDB first, then starts listening on the configured port.
 * If the database connection fails, the process exits immediately rather than
 * serving requests against an unavailable database.
 */

import { config } from './config';
import { connectDB } from './db';
import app from './app';

async function start(): Promise<void> {
  try {
    await connectDB();

    app.listen(config.port, () => {
      console.log(
        `[server] Listening on port ${config.port} (${process.env.NODE_ENV ?? 'development'})`,
      );
    });
  } catch (err) {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  }
}

start();

