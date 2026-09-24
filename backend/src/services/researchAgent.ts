/**
 * researchAgent.ts
 * ResearchAgent — queries public sources for company interview process discussions.
 *
 * Supports two providers, selected via the `RESEARCH_PROVIDER` env var:
 *   - "duckduckgo" (default): uses the DuckDuckGo Instant Answers API (no key needed)
 *   - "serpapi": uses the SerpApi search API (requires `SERPAPI_KEY`)
 *
 * Behaviour:
 *   - Builds a targeted search query including Glassdoor, Reddit, and Blind
 *   - Extracts up to 5 relevant text passages from results
 *   - Sanitises every passage via `sanitise()` before returning
 *   - Never passes raw HTML to callers
 *   - Applies exponential backoff on 429 rate-limit responses
 *   - On unreachable source: skips and continues (does not throw)
 *   - On zero results: sets `found: false`
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { sanitise } from '../middleware/sanitise';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResearchResult {
  /** Cleaned plain-text excerpts (up to 5). Empty array when none found. */
  passages: string[];
  /** Source URLs the passages were drawn from. */
  sources: string[];
  /** True when at least one relevant passage was found. */
  found: boolean;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface DuckDuckGoRelatedTopic {
  /** The topic text (may contain HTML). */
  Text?: string;
  /** Nested topics under an umbrella heading. */
  Topics?: DuckDuckGoRelatedTopic[];
  /** URL of the result page. */
  FirstURL?: string;
}

interface DuckDuckGoResponse {
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: DuckDuckGoRelatedTopic[];
}

interface SerpApiOrganicResult {
  snippet?: string;
  link?: string;
}

interface SerpApiResponse {
  organic_results?: SerpApiOrganicResult[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of passages to return. */
const MAX_PASSAGES = 5;

/**
 * Exponential backoff configuration for rate-limit (429) responses.
 * Delays in milliseconds: 2 s, 4 s, 8 s, 16 s, 32 s — up to 5 retries.
 */
const BACKOFF_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 32_000];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the search query for a given company.
 *
 * Example output:
 *   "Acme interview process site:glassdoor.com OR site:reddit.com OR site:blind.com"
 */
function buildQuery(companyName: string): string {
  return `${companyName} interview process site:glassdoor.com OR site:reddit.com OR site:blind.com`;
}

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Perform a GET request with exponential backoff on 429 responses.
 *
 * @param url     - Full URL to request.
 * @param params  - Query parameters.
 * @returns Parsed response data, or `null` if the source was unreachable.
 */
async function fetchWithBackoff<T>(
  url: string,
  params: Record<string, string>,
): Promise<T | null> {
  let attempt = 0;

  while (true) {
    try {
      const response = await axios.get<T>(url, {
        params,
        timeout: 10_000,
        headers: {
          'User-Agent': 'InterviewPrepKit/1.0 (research; +https://github.com/interview-prep)',
        },
      });
      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;

      // Rate-limited: back off and retry if we have attempts remaining.
      if (axiosErr.response?.status === 429 && attempt < BACKOFF_DELAYS_MS.length) {
        const delay = BACKOFF_DELAYS_MS[attempt];
        attempt++;
        await sleep(delay);
        continue;
      }

      // Any other error (network failure, 4xx, 5xx): treat as unreachable.
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// DuckDuckGo adapter
// ---------------------------------------------------------------------------

/**
 * Query the DuckDuckGo Instant Answers API and extract text passages.
 *
 * Parses:
 *   1. `AbstractText` — the primary summary text
 *   2. `RelatedTopics[].Text` — individual related topic snippets
 *      (recursively flattened from nested `Topics` arrays)
 *
 * Returns at most `MAX_PASSAGES` sanitised passages.
 */
async function duckDuckGoAdapter(
  companyName: string,
): Promise<Pick<ResearchResult, 'passages' | 'sources'>> {
  const query = buildQuery(companyName);

  const data = await fetchWithBackoff<DuckDuckGoResponse>(
    'https://api.duckduckgo.com/',
    {
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
    },
  );

  if (!data) {
    // Source unreachable — return empty result, do not throw.
    return { passages: [], sources: [] };
  }

  const passages: string[] = [];
  const sources: string[] = [];

  // 1. AbstractText — top-level summary if present.
  if (data.AbstractText) {
    const cleaned = sanitise(data.AbstractText);
    if (cleaned) {
      passages.push(cleaned);
      if (data.AbstractURL) sources.push(data.AbstractURL);
    }
  }

  // 2. RelatedTopics — flatten nested Topics and collect Text snippets.
  const flattenTopics = (
    topics: DuckDuckGoRelatedTopic[],
  ): DuckDuckGoRelatedTopic[] => {
    const result: DuckDuckGoRelatedTopic[] = [];
    for (const topic of topics) {
      if (topic.Topics && topic.Topics.length > 0) {
        // Umbrella group — recurse into nested Topics.
        result.push(...flattenTopics(topic.Topics));
      } else {
        result.push(topic);
      }
    }
    return result;
  };

  const relatedTopics = flattenTopics(data.RelatedTopics ?? []);

  for (const topic of relatedTopics) {
    if (passages.length >= MAX_PASSAGES) break;

    if (topic.Text) {
      const cleaned = sanitise(topic.Text);
      if (cleaned) {
        passages.push(cleaned);
        if (topic.FirstURL) sources.push(topic.FirstURL);
      }
    }
  }

  return { passages, sources };
}

// ---------------------------------------------------------------------------
// SerpApi adapter
// ---------------------------------------------------------------------------

/**
 * Query SerpApi and extract organic result snippets.
 *
 * Uses `organic_results[n].snippet` as passage text and `link` as source URL.
 * Returns at most `MAX_PASSAGES` sanitised passages.
 */
async function serpApiAdapter(
  companyName: string,
): Promise<Pick<ResearchResult, 'passages' | 'sources'>> {
  if (!config.serpApiKey) {
    console.warn(
      '[ResearchAgent] RESEARCH_PROVIDER=serpapi but SERPAPI_KEY is not set; skipping research.',
    );
    return { passages: [], sources: [] };
  }

  const query = buildQuery(companyName);

  const data = await fetchWithBackoff<SerpApiResponse>(
    'https://serpapi.com/search.json',
    {
      q: query,
      api_key: config.serpApiKey,
      num: String(MAX_PASSAGES),
    },
  );

  if (!data) {
    // Source unreachable.
    return { passages: [], sources: [] };
  }

  const passages: string[] = [];
  const sources: string[] = [];

  for (const result of data.organic_results ?? []) {
    if (passages.length >= MAX_PASSAGES) break;

    if (result.snippet) {
      const cleaned = sanitise(result.snippet);
      if (cleaned) {
        passages.push(cleaned);
        if (result.link) sources.push(result.link);
      }
    }
  }

  return { passages, sources };
}

// ---------------------------------------------------------------------------
// ResearchAgent
// ---------------------------------------------------------------------------

/**
 * ResearchAgent — public interface.
 */
export interface ResearchAgent {
  /**
   * Research public interview process discussions for a given company.
   *
   * @param companyName - The company's display name (used in the search query).
   * @param companyUrl  - The company's website URL (reserved for future use,
   *                      e.g. extracting domain for site-restricted search).
   * @returns Cleaned passages, source URLs, and a `found` flag.
   */
  research(companyName: string, companyUrl: string): Promise<ResearchResult>;
}

/**
 * Concrete implementation of `ResearchAgent`.
 *
 * Provider selection is driven by `config.researchProvider`:
 *   - `"duckduckgo"` → DuckDuckGo Instant Answers (no API key required)
 *   - `"serpapi"`    → SerpApi (requires `SERPAPI_KEY`)
 */
export class ResearchAgentImpl implements ResearchAgent {
  async research(companyName: string, _companyUrl: string): Promise<ResearchResult> {
    let result: Pick<ResearchResult, 'passages' | 'sources'>;

    if (config.researchProvider === 'serpapi') {
      result = await serpApiAdapter(companyName);
    } else {
      // Default: DuckDuckGo
      result = await duckDuckGoAdapter(companyName);
    }

    return {
      passages: result.passages,
      sources: result.sources,
      found: result.passages.length > 0,
    };
  }
}

/**
 * Singleton factory — creates one `ResearchAgentImpl` per import.
 * Import this in pipeline code rather than instantiating directly.
 */
export function createResearchAgent(): ResearchAgent {
  return new ResearchAgentImpl();
}
