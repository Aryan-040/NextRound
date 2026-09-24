/**
 * llmAdapters/groq.ts
 *
 * LLMClient adapter for Groq (OpenAI-compatible chat completions API).
 *
 * Endpoint:
 *   POST https://api.groq.com/openai/v1/chat/completions
 *
 * Auth: Bearer token using GROQ_API_KEY.
 *
 * Rate-limit handling: on HTTP 429 the adapter waits according to the
 * shared backoff schedule and retries up to 5 times before re-throwing.
 */

import axios, { AxiosError } from 'axios';
import type { LLMClient, LLMPrompt } from '../llmClient';
import { sleep, RATE_LIMIT_BACKOFFS_MS } from '../llmClient';

// â”€â”€ Groq / OpenAI chat types (minimal) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqRequestBody {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  response_format?: { type: 'json_object' };
}

interface GroqResponseBody {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// â”€â”€ Adapter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const GROQ_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_RATE_LIMIT_RETRIES = 5;

export class GroqAdapter implements LLMClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(prompt: LLMPrompt): Promise<string> {
    const body: GroqRequestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user',   content: prompt.user },
      ],
      // Temperature 0 for deterministic, schema-compliant output.
      temperature: 0,
    };

    // Only request JSON mode for models known to support it
    const jsonModeModels = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant'];
    if (jsonModeModels.some(m => this.model.includes(m))) {
      body.response_format = { type: 'json_object' };
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        const response = await axios.post<GroqResponseBody>(
          GROQ_COMPLETIONS_URL,
          body,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
          },
        );

        const content = response.data?.choices?.[0]?.message?.content;

        if (typeof content !== 'string') {
          throw new Error('Groq response did not contain a message content string.');
        }

        return content;
      } catch (err) {
        lastError = err;

        const status = (err as AxiosError)?.response?.status;

        // Retry on rate-limit (429) and transient server errors (503/502/504).
        const isRetryable = status === 429 || status === 503 || status === 502 || status === 504;
        if (!isRetryable) {
          throw err;
        }

        // No more retries available â€” let the outer caller handle it.
        if (attempt >= MAX_RATE_LIMIT_RETRIES) {
          break;
        }

        // Use longer waits for this low-quota model
        const backoffs = [10_000, 20_000, 40_000, 60_000, 60_000];
        const delayMs = backoffs[attempt] ?? 60_000;
        await sleep(delayMs);
      }
    }

    throw lastError;
  }
}

