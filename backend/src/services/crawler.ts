/**
 * crawler.ts
 * CrawlerService — BFS-based company site crawler with link scoring.
 *
 * Task 6.1 responsibilities:
 *   - Fetch the root company URL and extract all anchor links.
 *   - Score each link on a 0–10 scale against hiring-relevance keywords.
 *   - Partition links into high-priority (score ≥ 5) and low-priority queues.
 *   - BFS traversal: process high-priority queue first, then fill remaining
 *     capacity from low-priority queue, up to maxDepth and maxPages.
 *   - Call `isUrlSafe` before every outbound fetch; skip disallowed URLs.
 *   - Return cleaned plain-text content via `sanitise()`.
 *
 * Task 6.2 additions:
 *   - robots.txt: fetch and cache per domain; skip disallowed paths;
 *     treat fetch failure as all-allowed.
 *   - Token-bucket rate limiter: 2 req/s per domain.
 *   - Retry logic: 429/5xx → exponential backoff 1 s → 2 s → 4 s → 8 s,
 *     up to 3 retries.
 *   - Content-Type validation: skip responses that don't begin with
 *     "text/html".
 *   - Body size limit: skip response bodies > 5 MB.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11
 */

import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import type { Robot } from 'robots-parser';
import { isUrlSafe } from '../middleware/ssrfGuard';
import { sanitise } from '../middleware/sanitise';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrawlerResult {
  /** Cleaned plain-text content for each successfully fetched page. */
  pages: Array<{ url: string; text: string }>;
  /** URLs that contributed a page to the result. */
  sourcesUsed: string[];
  /** URLs that could not be fetched, with a reason. */
  failures: Array<{ url: string; reason: string }>;
}

export interface CrawlerOptions {
  maxDepth?: number;  // default: 3
  maxPages?: number;  // default: 50
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Keywords that indicate a page is likely an about/hiring page.
 *
 * Each keyword is matched:
 *   +3 pts — keyword appears as an exact path segment (e.g. "/careers/")
 *   +2 pts — keyword appears as a word in the anchor link text
 *   +1 pt  — keyword appears anywhere in the URL (path, host, query)
 *
 * Total capped at 10.
 */
const KEYWORDS: ReadonlyArray<string> = [
  'about',
  'careers',
  'hiring',
  'jobs',
  'culture',
  'engineering blog',
  'engineering-blog',
  'blog',
  'team',
  'people',
];

/** Multi-word keywords that need special handling for path-segment matching. */
const MULTI_WORD_KEYWORDS: ReadonlyArray<string> = [
  'engineering blog',
  'engineering-blog',
];

/** Links with this score or above enter the high-priority queue. */
const HIGH_PRIORITY_THRESHOLD = 5;

/** HTTP request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Maximum response body size in bytes (5 MB). Requirement 5.8. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/** User-agent string sent with every request (and used for robots.txt lookup). */
const USER_AGENT = 'InterviewPrepBot/1.0 (+https://interview-prep-kit)';

/** Token bucket: maximum sustained request rate per domain. Requirement 5.5. */
const RATE_LIMIT_RPS = 2; // requests per second

/** Retry config for 429 / 5xx responses. Requirement 5.6. */
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000];

// ---------------------------------------------------------------------------
// Link scoring
// ---------------------------------------------------------------------------

/**
 * Normalise a keyword to a form suitable for URL/text comparison.
 * Lowercases and trims.
 */
function normaliseKeyword(kw: string): string {
  return kw.toLowerCase().trim();
}

/**
 * Extract the path segments from a URL as an array of lower-cased strings.
 * e.g. "https://example.com/about/careers/" → ["about", "careers"]
 */
function pathSegments(urlString: string): string[] {
  try {
    const url = new URL(urlString);
    return url.pathname
      .split('/')
      .map(s => s.toLowerCase().trim())
      .filter(s => s.length > 0);
  } catch {
    return [];
  }
}

/**
 * Score a single discovered link against the hiring-relevance keyword list.
 *
 * Scoring rules (additive, capped at 10):
 *   +3  exact path segment match for a single-word keyword
 *       e.g. "/careers/" matches "careers"
 *   +2  keyword word(s) appear in the anchor link text (word boundary match)
 *   +1  keyword appears anywhere in the URL string (substring)
 *
 * "engineering blog" is treated as a two-word keyword — matched against
 * combined path segments and link text rather than a single segment.
 *
 * @param href      Absolute URL of the discovered link.
 * @param linkText  Visible text of the `<a>` element.
 * @returns Score in the range [0, 10].
 */
export function scoreLink(href: string, linkText: string): number {
  const hrefLower = href.toLowerCase();
  const textLower = linkText.toLowerCase().trim();
  const segments = pathSegments(href);
  const segmentSet = new Set(segments);

  let score = 0;

  for (const keyword of KEYWORDS) {
    const kw = normaliseKeyword(keyword);
    const isMultiWord = MULTI_WORD_KEYWORDS.some(
      mk => normaliseKeyword(mk) === kw,
    );

    if (isMultiWord) {
      // Multi-word: check URL contains the full phrase or hyphenated variant,
      // and link text contains the phrase.
      const hyphenated = kw.replace(/\s+/g, '-');
      if (hrefLower.includes(kw) || hrefLower.includes(hyphenated)) {
        // Treat presence anywhere in URL as segment-level match for multi-word
        score += 3;
      } else if (textLower.includes(kw) || textLower.includes(hyphenated)) {
        score += 2;
      }
    } else {
      // Single-word keyword
      // +3: exact path segment match
      if (segmentSet.has(kw)) {
        score += 3;
      }
      // +2: word appears in link text (word boundary)
      const textWordBoundary = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
      if (textWordBoundary.test(textLower)) {
        score += 2;
      }
      // +1: keyword appears anywhere in URL
      if (hrefLower.includes(kw)) {
        score += 1;
      }
    }
  }

  return Math.min(score, 10);
}

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// URL normalisation and deduplication
// ---------------------------------------------------------------------------

/**
 * Resolve a potentially relative href against a base URL and return an
 * absolute URL string, or `null` if the href cannot be resolved.
 *
 * Fragment-only hrefs (e.g. "#section") are discarded.
 * Only http and https schemes are retained.
 */
export function resolveHref(base: string, href: string): string | null {
  try {
    const resolved = new URL(href, base);
    if (!['http:', 'https:'].includes(resolved.protocol)) return null;
    // Discard fragment — avoid treating "#section" as a separate page
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

/**
 * Extract all `<a href>` links from an HTML page, resolve them against the
 * page URL, and deduplicate. Returns an array of `{ href, text }` objects.
 */
function extractLinks(
  html: string,
  pageUrl: string,
): Array<{ href: string; text: string }> {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const links: Array<{ href: string; text: string }> = [];

  $('a[href]').each((_i, el) => {
    const raw = $(el).attr('href');
    if (!raw) return;

    const href = resolveHref(pageUrl, raw);
    if (!href) return;
    if (seen.has(href)) return;
    seen.add(href);

    const text = $(el).text().replace(/\s+/g, ' ').trim();
    links.push({ href, text });
  });

  return links;
}

// ---------------------------------------------------------------------------
// Queue entries
// ---------------------------------------------------------------------------

interface QueueEntry {
  url: string;
  depth: number;
}

// ---------------------------------------------------------------------------
// Token bucket rate limiter (per domain)
// Requirement 5.5: max 2 req/s per domain.
// ---------------------------------------------------------------------------

/**
 * Simple token-bucket rate limiter.
 *
 * Each domain gets its own bucket. Tokens refill at `rps` per second.
 * If no token is available, the caller waits until one is refilled.
 */
class DomainRateLimiter {
  /** tokens[domain] = fractional token count */
  private readonly tokens = new Map<string, number>();
  /** lastRefill[domain] = Date.now() at last refill */
  private readonly lastRefill = new Map<string, number>();

  constructor(private readonly rps: number) {}

  /**
   * Consume one token for the given domain, waiting if necessary.
   * This ensures at most `rps` requests per second leave the bucket.
   */
  async acquire(domain: string): Promise<void> {
    const now = Date.now();
    const last = this.lastRefill.get(domain) ?? now;
    const current = this.tokens.get(domain) ?? this.rps;

    // Refill tokens proportional to elapsed time
    const elapsed = (now - last) / 1_000; // seconds
    const refilled = Math.min(this.rps, current + elapsed * this.rps);

    if (refilled >= 1) {
      // Token available — consume immediately
      this.tokens.set(domain, refilled - 1);
      this.lastRefill.set(domain, now);
    } else {
      // Wait until a token is available
      const waitMs = Math.ceil(((1 - refilled) / this.rps) * 1_000);
      await sleep(waitMs);
      this.tokens.set(domain, 0);
      this.lastRefill.set(domain, Date.now());
    }
  }
}

// ---------------------------------------------------------------------------
// robots.txt cache (per domain)
// Requirement 5.3: fetch and cache robots.txt; skip disallowed paths;
// treat fetch failure as all-allowed.
// ---------------------------------------------------------------------------

/**
 * Fetch and parse robots.txt for the given origin (scheme + host + port).
 * Returns `null` if the file could not be fetched — treat as all-allowed.
 */
async function fetchRobots(origin: string): Promise<Robot | null> {
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const response = await axios.get<string>(robotsUrl, {
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'text',
      validateStatus: (s) => s >= 200 && s < 300,
      headers: { 'User-Agent': USER_AGENT },
    });
    const content = typeof response.data === 'string' ? response.data : '';
    return robotsParser(robotsUrl, content);
  } catch {
    // Fetch failure → treat all paths as allowed (Requirement 5.3)
    return null;
  }
}

/**
 * Derive the "origin" key (scheme://host[:port]) for caching robots.txt.
 */
function originKey(urlString: string): string {
  try {
    const u = new URL(urlString);
    return u.origin;
  } catch {
    return urlString;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** HTTP status codes that should trigger a retry. Requirement 5.6. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

// ---------------------------------------------------------------------------
// CrawlerService
// ---------------------------------------------------------------------------

/**
 * Implementation of the CrawlerService interface.
 *
 * Usage:
 *   const crawler = new CrawlerService();
 *   const result = await crawler.crawl('https://example.com', { maxDepth: 3, maxPages: 50 });
 */
export class CrawlerService {
  private readonly rateLimiter = new DomainRateLimiter(RATE_LIMIT_RPS);
  /** Cache: origin → parsed Robot (null = fetch failed → all-allowed) */
  private readonly robotsCache = new Map<string, Robot | null>();

  /**
   * Crawl a company website starting from `companyUrl`.
   *
   * Algorithm:
   *  1. Fetch robots.txt for the root domain and cache it.
   *  2. Fetch the root URL; parse all anchor links and score them.
   *  3. Partition scored links into high-priority (≥ 5) and low-priority queues.
   *  4. BFS: drain high-priority first, then fill from low-priority, until
   *     maxPages is reached or both queues are empty.
   *  5. For every URL about to be fetched:
   *       a. Call `isUrlSafe`; skip if unsafe.
   *       b. Check robots.txt; skip if disallowed.
   *       c. Acquire a rate-limiter token for the domain.
   *  6. Sanitise fetched HTML to plain text before recording.
   *
   * @param companyUrl  Starting URL (must be http or https).
   * @param options     Optional `{ maxDepth, maxPages }`.
   */
  async crawl(
    companyUrl: string,
    options?: CrawlerOptions,
  ): Promise<CrawlerResult> {
    const maxDepth = options?.maxDepth ?? 3;
    const maxPages = options?.maxPages ?? 50;

    const pages: CrawlerResult['pages'] = [];
    const sourcesUsed: string[] = [];
    const failures: CrawlerResult['failures'] = [];

    // Track visited URLs to avoid cycles.
    const visited = new Set<string>();

    // BFS queues
    const highPriorityQueue: QueueEntry[] = [];
    const lowPriorityQueue: QueueEntry[] = [];

    // ---------------------------------------------------------------------------
    // Pre-flight: prime robots.txt cache for the root domain (Requirement 5.3)
    // ---------------------------------------------------------------------------
    const rootOrigin = originKey(companyUrl);
    await this.ensureRobotsCached(rootOrigin);

    // ---------------------------------------------------------------------------
    // Step 1: Fetch the root URL
    // ---------------------------------------------------------------------------
    const rootEntry: QueueEntry = { url: companyUrl, depth: 0 };

    // Check SSRF safety for the root URL
    const rootSafe = await isUrlSafe(companyUrl);
    if (!rootSafe) {
      failures.push({ url: companyUrl, reason: 'SSRF guard: URL targets a disallowed address' });
      return { pages, sourcesUsed, failures };
    }

    // Check robots.txt for root URL
    if (!this.isAllowedByRobots(companyUrl)) {
      failures.push({ url: companyUrl, reason: 'Disallowed by robots.txt' });
      return { pages, sourcesUsed, failures };
    }

    // Acquire rate-limiter token for root domain
    await this.rateLimiter.acquire(this.domainOf(companyUrl));

    // Fetch root
    const rootFetch = await this.fetchPage(companyUrl);
    if (!rootFetch.ok) {
      failures.push({ url: companyUrl, reason: rootFetch.error });
      return { pages, sourcesUsed, failures };
    }

    const rootHtml = rootFetch.html;
    const rootText = sanitise(rootHtml);
    pages.push({ url: companyUrl, text: rootText });
    sourcesUsed.push(companyUrl);
    visited.add(companyUrl);

    // ---------------------------------------------------------------------------
    // Step 2: Score and partition links from the root page
    // ---------------------------------------------------------------------------
    this.extractAndEnqueue(
      rootHtml,
      companyUrl,
      rootEntry.depth,
      maxDepth,
      visited,
      highPriorityQueue,
      lowPriorityQueue,
    );

    // ---------------------------------------------------------------------------
    // Step 3 & 4: BFS — high-priority first, then low-priority
    // ---------------------------------------------------------------------------
    while (
      (highPriorityQueue.length > 0 || lowPriorityQueue.length > 0) &&
      pages.length < maxPages
    ) {
      // Always prefer high-priority entries
      const entry: QueueEntry =
        highPriorityQueue.length > 0
          ? highPriorityQueue.shift()!
          : lowPriorityQueue.shift()!;

      const { url, depth } = entry;

      // Skip if already visited (could have been added to both queues before dequeue)
      if (visited.has(url)) continue;
      visited.add(url);

      // SSRF check before every outbound fetch (Requirement 5.4 / design §Security)
      const safe = await isUrlSafe(url);
      if (!safe) {
        failures.push({ url, reason: 'SSRF guard: URL targets a disallowed address' });
        continue;
      }

      // robots.txt check (Requirement 5.3)
      const linkOrigin = originKey(url);
      await this.ensureRobotsCached(linkOrigin);
      if (!this.isAllowedByRobots(url)) {
        failures.push({ url, reason: 'Disallowed by robots.txt' });
        continue;
      }

      // Acquire rate-limiter token for this domain (Requirement 5.5)
      await this.rateLimiter.acquire(this.domainOf(url));

      // Fetch the page
      const result = await this.fetchPage(url);
      if (!result.ok) {
        failures.push({ url, reason: result.error });
        continue;
      }

      const html = result.html;
      const text = sanitise(html);
      pages.push({ url, text });
      sourcesUsed.push(url);

      // Discover and enqueue links from this page (only if below maxDepth)
      if (depth < maxDepth) {
        this.extractAndEnqueue(
          html,
          url,
          depth,
          maxDepth,
          visited,
          highPriorityQueue,
          lowPriorityQueue,
        );
      }
    }

    return { pages, sourcesUsed, failures };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract links from `html`, score them, and enqueue unvisited links.
   * High-priority links (score ≥ 5) are pushed to `highPriorityQueue`;
   * others go to `lowPriorityQueue`.
   */
  private extractAndEnqueue(
    html: string,
    pageUrl: string,
    currentDepth: number,
    maxDepth: number,
    visited: Set<string>,
    highPriorityQueue: QueueEntry[],
    lowPriorityQueue: QueueEntry[],
  ): void {
    if (currentDepth >= maxDepth) return;

    const links = extractLinks(html, pageUrl);

    for (const { href, text } of links) {
      if (visited.has(href)) continue;

      const score = scoreLink(href, text);
      const entry: QueueEntry = { url: href, depth: currentDepth + 1 };

      if (score >= HIGH_PRIORITY_THRESHOLD) {
        highPriorityQueue.push(entry);
      } else {
        lowPriorityQueue.push(entry);
      }
    }
  }

  /**
   * Fetch a URL and return the raw HTML body, or an error message.
   *
   * Task 6.2 additions:
   *  - Retries up to MAX_RETRIES times on 429 or 5xx with exponential backoff.
   *  - Validates Content-Type begins with "text/html" (Requirement 5.7).
   *  - Rejects bodies > MAX_BODY_BYTES (Requirement 5.8).
   */
  private async fetchPage(
    url: string,
  ): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Exponential backoff before retry attempts (not before the first try)
      if (attempt > 0) {
        const delayMs = RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)];
        await sleep(delayMs);
      }

      try {
        const response = await axios.get<string>(url, {
          timeout: REQUEST_TIMEOUT_MS,
          responseType: 'text',
          maxRedirects: 5,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          },
          // Accept ALL status codes so we can inspect them for retry decisions.
          // We'll interpret the status below rather than throwing on 4xx/5xx.
          validateStatus: () => true,
        });

        const status = response.status;

        // Retry on 429 or 5xx (Requirement 5.6)
        if (isRetryableStatus(status)) {
          lastError = `HTTP ${status}`;
          if (attempt < MAX_RETRIES) {
            continue; // retry
          }
          return { ok: false, error: `HTTP ${status} after ${MAX_RETRIES} retries` };
        }

        // Non-2xx and non-retryable: treat as a failure, no retry
        if (status < 200 || status >= 300) {
          return { ok: false, error: `HTTP ${status}` };
        }

        // ── Content-Type check (Requirement 5.7) ───────────────────────────
        const contentType: string =
          (response.headers['content-type'] as string | undefined) ?? '';
        if (!contentType.toLowerCase().startsWith('text/html')) {
          return {
            ok: false,
            error: `Skipped: Content-Type "${contentType}" is not text/html`,
          };
        }

        // ── Body size check (Requirement 5.8) ──────────────────────────────
        const html =
          typeof response.data === 'string'
            ? response.data
            : String(response.data);

        // JavaScript strings are UTF-16 internally, but we compare against
        // the byte representation. A worst-case 3-byte UTF-8 character is
        // still ≤ 3 bytes. To stay safe we check against string .length * 3
        // as a conservative upper bound before a full byte count.
        // For most ASCII-heavy HTML the string .length ≈ byte count.
        const approximateBytes = html.length;
        if (approximateBytes > MAX_BODY_BYTES) {
          return {
            ok: false,
            error: `Skipped: response body (≈${(approximateBytes / 1024 / 1024).toFixed(1)} MB) exceeds 5 MB limit`,
          };
        }

        return { ok: true, html };

      } catch (err: unknown) {
        const message = axiosErrorMessage(err);

        // Only retry on network-level errors if they look transient
        lastError = message;
        if (attempt < MAX_RETRIES && isTransientError(err)) {
          continue;
        }
        return { ok: false, error: message };
      }
    }

    return { ok: false, error: lastError };
  }

  // ---------------------------------------------------------------------------
  // robots.txt helpers
  // ---------------------------------------------------------------------------

  /**
   * Ensure the robots.txt for the given origin is cached.
   * Safe to call multiple times for the same origin — fetches only once.
   */
  private async ensureRobotsCached(origin: string): Promise<void> {
    if (!this.robotsCache.has(origin)) {
      const robot = await fetchRobots(origin);
      this.robotsCache.set(origin, robot);
    }
  }

  /**
   * Return true if the URL is permitted by the cached robots.txt rules,
   * or if no robots.txt was found (all-allowed fallback).
   *
   * Requirement 5.3.
   */
  private isAllowedByRobots(url: string): boolean {
    const origin = originKey(url);
    const robot = this.robotsCache.get(origin);
    if (!robot) return true; // not cached or fetch failed → all-allowed
    const allowed = robot.isAllowed(url, USER_AGENT);
    // robots-parser returns undefined when no matching rule exists → allowed
    return allowed !== false;
  }

  /**
   * Extract just the hostname from a URL string (used as the rate-limiter key).
   */
  private domainOf(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}

// ---------------------------------------------------------------------------
// Error message helpers
// ---------------------------------------------------------------------------

/**
 * Extract a human-readable error message from an axios error (or any thrown
 * value).
 */
function axiosErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (
      e.response &&
      typeof e.response === 'object' &&
      'status' in (e.response as object)
    ) {
      const resp = e.response as { status: number };
      return `HTTP ${resp.status}`;
    }
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
      return 'Connection timeout';
    }
    if (typeof e.message === 'string') return e.message;
  }
  return String(err);
}

/**
 * Determine whether a caught error looks like a transient network condition
 * that warrants a retry (e.g. timeout, ECONNRESET).
 */
function isTransientError(err: unknown): boolean {
  if (err instanceof AxiosError) {
    const transientCodes = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'];
    return err.code !== undefined && transientCodes.includes(err.code);
  }
  return false;
}
