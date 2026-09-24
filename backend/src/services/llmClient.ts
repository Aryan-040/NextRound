/**
 * llmClient.ts
 *
 * Defines the LLMClient interface and shared helpers used by every LLM adapter:
 *
 *  - `LLMPrompt`          — typed system + user message pair
 *  - `LLMClient`          — single-method interface all adapters implement
 *  - `completeWithJsonRetry` — wraps any LLMClient with JSON-parse retry
 *                              (up to 3 attempts, correction prompt on failure)
 *  - `createLLMClient`    — factory that reads LLM_PROVIDER from config and
 *                           returns the matching adapter instance
 */

import { config } from '../config';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A two-part prompt sent to an LLM. */
export interface LLMPrompt {
  /** System instructions (role, output format, schema). */
  system: string;
  /** User turn containing task instructions and any external content. */
  user: string;
}

/** Minimal interface every LLM adapter must satisfy. */
export interface LLMClient {
  /**
   * Send a prompt and return the raw text response from the model.
   * Throws on unrecoverable network or API errors.
   */
  complete(prompt: LLMPrompt): Promise<string>;
}

// ── JSON-parse retry wrapper ──────────────────────────────────────────────────

const JSON_RETRY_MESSAGE =
  'Your previous response was not valid JSON. Respond only with JSON conforming to the schema.';

/**
 * Calls `client.complete(prompt)` and attempts to parse the response as JSON.
 *
 * On a JSON parse failure the correction instruction is appended to the user
 * message and the call is retried. A maximum of 3 total attempts are made.
 *
 * @returns The parsed JSON object on success.
 * @throws  The last parse error after 3 failed attempts.
 */
export async function completeWithJsonRetry(
  client: LLMClient,
  prompt: LLMPrompt,
): Promise<unknown> {
  const MAX_ATTEMPTS = 3;
  let currentPrompt: LLMPrompt = { ...prompt };
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await client.complete(currentPrompt);

    // Strip accidental markdown code fences the model may wrap the JSON in.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      lastError = err;

      if (attempt < MAX_ATTEMPTS) {
        // Append the correction message and retry with the extended user prompt.
        currentPrompt = {
          ...currentPrompt,
          user: `${currentPrompt.user}\n\n${JSON_RETRY_MESSAGE}`,
        };
      }
    }
  }

  throw lastError;
}

// ── Rate-limit backoff helper ─────────────────────────────────────────────────

/**
 * Delays for the specified number of milliseconds.
 * Extracted for easy test-time replacement.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Backoff schedule for rate-limit (429) responses: 2 s → 4 s → 8 s → 16 s → 32 s → 60 s (cap).
 * Up to 5 retries are performed before the error is re-thrown.
 */
export const RATE_LIMIT_BACKOFFS_MS: readonly number[] = [
  2_000, 4_000, 8_000, 16_000, 32_000, 60_000,
];

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns an `LLMClient` instance for the provider specified in `LLM_PROVIDER`.
 * The adapters are imported lazily so neither Gemini nor Groq SDK code is
 * loaded unless actually needed.
 */
export async function createLLMClient(): Promise<LLMClient> {
  if (config.llmProvider === 'gemini') {
    const { GeminiAdapter } = await import('./llmAdapters/gemini');
    return new GeminiAdapter(config.geminiApiKey!, config.geminiModel);
  }

  if (config.llmProvider === 'groq') {
    const { GroqAdapter } = await import('./llmAdapters/groq');
    return new GroqAdapter(config.groqApiKey!, config.groqModel);
  }

  throw new Error(
    `Unknown LLM_PROVIDER "${config.llmProvider}". Accepted values: "gemini" | "groq".`,
  );
}
