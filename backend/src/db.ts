/**
 * db.ts
 * MongoDB connection helpers using Mongoose.
 *
 * connectDB() should be called once at server startup (server.ts).
 * disconnectDB() is provided for clean teardown in tests and graceful
 * shutdown handlers.
 *
 * Connection events are logged so operators can see real-time status in the
 * process output without enabling Mongoose's verbose debug mode.
 */

import mongoose from 'mongoose';
import { config } from './config';

/**
 * Connects to MongoDB using the URI from environment config.
 * Logs a success message on first open and attaches persistent listeners for
 * disconnection and error events so issues after the initial connect are
 * visible in the logs.
 */
export async function connectDB(): Promise<void> {
  // Attach lifecycle listeners before connecting so they catch events that
  // fire during the connect() call itself.
  mongoose.connection.on('connected', () => {
    console.log('[db] MongoDB connection established');
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB connection lost');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[db] MongoDB reconnected');
  });

  mongoose.connection.on('error', (err: Error) => {
    console.error('[db] MongoDB connection error:', err.message);
  });

  await mongoose.connect(config.mongoUri);
}

/**
 * Gracefully closes the Mongoose connection.
 * Useful for clean test teardown and SIGTERM/SIGINT handlers.
 */
export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  console.log('[db] MongoDB disconnected');
}
