/**
 * evaluate.ts
 *
 * CLI batch runner for the AI Interview Prep Kit pipeline.
 *
 * Usage (from repo root):
 *   npm run evaluate -- --input <path> --output <path>
 *
 * Usage (from backend/):
 *   npm run evaluate -- --input <path> --output <path>
 *
 * Input format: JSON array of BatchCase objects.
 * Output format: { version: "1.0", generated_at: "<ISO 8601>", kits: [...] }
 *
 * Requirements: 4.1–4.12
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { runPipeline } from '../services/extractionPipeline';
import type { Kit } from '@interview-prep/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single case from the input JSON array.
 * Requirements: 4.2
 */
interface BatchCase {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

/**
 * A single entry in the output kits array.
 * Requirements: 4.4, 4.5
 */
interface BatchResultEntry {
  id: string;
  status: 'ok' | 'failed';
  kit: Kit | null;
  error: { code: string; message: string } | null;
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

/**
 * Validate a parsed case object for the required fields and types.
 *
 * Requirements: 4.2, 4.12
 *
 * @returns A descriptive message if validation fails, or null on success.
 */
function validateCase(c: unknown): string | null {
  if (!c || typeof c !== 'object') {
    return 'Case is not an object';
  }

  const obj = c as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(obj, 'id') || typeof obj.id !== 'string' || obj.id.trim() === '') {
    return 'Missing or invalid field "id" — expected a non-empty string';
  }

  if (!Object.prototype.hasOwnProperty.call(obj, 'jd') || typeof obj.jd !== 'string') {
    return 'Missing or invalid field "jd" — expected a string';
  }

  if (!Object.prototype.hasOwnProperty.call(obj, 'company_url') || typeof obj.company_url !== 'string') {
    return 'Missing or invalid field "company_url" — expected a string';
  }

  if (
    !Object.prototype.hasOwnProperty.call(obj, 'days') ||
    typeof obj.days !== 'number' ||
    !Number.isInteger(obj.days) ||
    obj.days < 0
  ) {
    return 'Missing or invalid field "days" — expected a non-negative integer';
  }

  return null; // valid
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Entry point for the batch runner.
 *
 * Reads `--input` and `--output` flags, processes each case through the same
 * pipeline used by the web server, and writes results to the output file.
 *
 * Requirements: 4.1–4.12
 */
export async function main(): Promise<void> {
  // ── Parse CLI arguments ──────────────────────────────────────────────────
  const { values } = parseArgs({
    options: {
      input:  { type: 'string' },
      output: { type: 'string' },
    },
    strict: false, // allow unknown args without throwing
  });

  if (!values.input || !values.output) {
    process.stderr.write(
      'Usage: npm run evaluate -- --input <path> --output <path>\n',
    );
    process.exit(1);
  }

  // After the guard above both values are guaranteed to be strings.
  const inputPath = values.input as string;
  const outputPath = values.output as string;

  // ── Read and validate input file ─────────────────────────────────────────
  // Requirements: 4.2, 4.11
  let cases: unknown[];
  try {
    const raw = readFileSync(inputPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      process.stderr.write(
        `Error reading input file "${inputPath}": content is not a JSON array\n`,
      );
      process.exit(1);
    }

    cases = parsed;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `Error reading input file "${inputPath}": ${message}\n`,
    );
    process.exit(1);
  }

  // ── Process each case sequentially ───────────────────────────────────────
  const results: BatchResultEntry[] = [];
  const total = cases.length;

  for (let i = 0; i < total; i++) {
    const raw = cases[i];

    // Validate case fields (Requirement 4.12)
    const validationError = validateCase(raw);
    if (validationError !== null) {
      const id = (raw && typeof raw === 'object' && 'id' in (raw as object))
        ? String((raw as Record<string, unknown>).id)
        : '(unknown)';

      process.stdout.write(
        `Processing case ${i + 1}/${total}: id=${id} — SKIPPED (invalid case: ${validationError})\n`,
      );

      results.push({
        id,
        status: 'failed',
        kit: null,
        error: {
          code: 'INVALID_CASE',
          message: validationError,
        },
      });
      continue;
    }

    const c = raw as BatchCase;

    process.stdout.write(
      `Processing case ${i + 1}/${total}: id=${c.id}\n`,
    );

    try {
      const kit = await runPipeline({
        jobDescription: c.jd,
        companyUrl: c.company_url,
        daysAvailable: c.days,
        onProgress: (evt) => {
          process.stdout.write(
            `  [${c.id}] ${evt.stage}: ${evt.status}${evt.error ? ` — ${evt.error}` : ''}\n`,
          );
        },
      });

      process.stdout.write(`  [${c.id}] pipeline complete — status: ok\n`);

      results.push({
        id: c.id,
        status: 'ok',
        kit,
        error: null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error
        ? err.message
        : String(err);

      const code = (err instanceof Error && 'code' in err && typeof (err as NodeJS.ErrnoException).code === 'string')
        ? ((err as NodeJS.ErrnoException).code as string)
        : 'PIPELINE_ERROR';

      process.stdout.write(
        `  [${c.id}] pipeline failed — ${message.slice(0, 200)}\n`,
      );

      results.push({
        id: c.id,
        status: 'failed',
        kit: null,
        error: {
          code,
          message: message.slice(0, 512),
        },
      });
    }
  }

  // ── Write output file ────────────────────────────────────────────────────
  // Requirement: 4.7
  const output = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    kits: results,
  };

  try {
    writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `Error writing output file "${outputPath}": ${message}\n`,
    );
    process.exit(1);
  }

  const successCount = results.filter(r => r.status === 'ok').length;
  const failCount = results.filter(r => r.status === 'failed').length;

  process.stdout.write(
    `\nDone. ${successCount}/${total} succeeded, ${failCount}/${total} failed.\n`,
    );
}

// ---------------------------------------------------------------------------
// Script entry point
// ---------------------------------------------------------------------------

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
