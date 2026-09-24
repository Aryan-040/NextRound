/**
 * llmAdapters/gemini.ts
 *
 * LLMClient adapter for Google Gemini (generativelanguage API).
 *
 * Endpoint:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}
 *
 * Rate-limit handling: on HTTP 429 the adapter waits according to the
 * shared backoff schedule and retries up to 5 times before re-throwing.
 */

import axios, { AxiosError } from 'axios';
import type { LLMClient, LLMPrompt } from '../llmClient';
import { sleep, RATE_LIMIT_BACKOFFS_MS } from '../llmClient';

// ── Gemini REST types (minimal — only the fields we use) ──────────────────────

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiRequestBody {
  system_instruction?: {
    parts: GeminiPart[];
  };
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    responseMimeType?: string;
  };
}

interface GeminiResponseBody {
  candidates: Array<{
    content: {
      parts: GeminiPart[];
    };
  }>;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

const MAX_RATE_LIMIT_RETRIES = 5;

export class GeminiAdapter implements LLMClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(prompt: LLMPrompt): Promise<string> {
    const url = `${GEMINI_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;

    const body: GeminiRequestBody = {
      // Gemini v1beta supports a top-level system_instruction field.
      system_instruction: {
        parts: [{ text: prompt.system }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt.user }],
        },
      ],
      generationConfig: {
        // Temperature 0 gives the most deterministic, schema-compliant output.
        temperature: 0,
        responseMimeType: 'application/json',
      },
    };

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        const response = await axios.post<GeminiResponseBody>(url, body, {
          headers: { 'Content-Type': 'application/json' },
        });

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (typeof text !== 'string') {
          throw new Error('Gemini response did not contain a text candidate.');
        }

        return text;
      } catch (err) {
        lastError = err;

        const status = (err as AxiosError)?.response?.status;

        // Only back off on rate-limit (429) responses.
        if (status !== 429) {
          throw err;
        }

        // No more retries available — let the outer caller handle it.
        if (attempt >= MAX_RATE_LIMIT_RETRIES) {
          break;
        }

        const delayMs = RATE_LIMIT_BACKOFFS_MS[attempt] ?? RATE_LIMIT_BACKOFFS_MS.at(-1)!;
        await sleep(delayMs);
      }
    }

    throw lastError;
  }
}
