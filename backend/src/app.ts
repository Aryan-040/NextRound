/**
 * app.ts
 * Creates and configures the Express application instance.
 * Middleware order matters: helmet → cors → body parsers → routes → error handler.
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth';
import kitsRouter from './routes/kits';
import practiceRouter from './routes/practice';

const app: Application = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS — allow all origins ─────────────────────────────────────────────────
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// ── Body parsers ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/kits', kitsRouter);
// Practice routes are nested under /api/kits/:id/practice — the router uses
// mergeParams:true so it can access :id from the parent path.
app.use('/api/kits/:id/practice', practiceRouter);

// ── Global error handler (must be the last middleware registered) ──────────────
app.use(errorHandler);

export default app;
