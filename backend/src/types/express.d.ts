/**
 * express.d.ts
 * Augments Express's Request type to include the `user` property that the
 * `authenticate` middleware attaches after verifying a JWT.
 *
 * Declaring this in a separate `.d.ts` file keeps the augmentation global
 * across the entire backend package without importing it anywhere explicitly.
 */

declare namespace Express {
  interface Request {
    user?: {
      userId: string;
      email: string;
    };
  }
}
