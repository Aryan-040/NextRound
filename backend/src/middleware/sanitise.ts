/**
 * sanitise.ts
 * Utility for stripping HTML and decoding entities from externally sourced text
 * before it is stored or passed to the LLM.
 *
 * Steps applied in order:
 *  1. Remove <script> and <style> elements (with their content).
 *  2. Strip all remaining HTML tags and attributes.
 *  3. Decode HTML entities (named and numeric) via the `he` package.
 *  4. Normalise whitespace to a single space and trim.
 *
 * Requirements: 17.5
 */

import he from 'he';

/**
 * Sanitise an HTML string to plain text.
 *
 * @param html - Raw HTML string to sanitise. Null/undefined inputs are treated
 *               as empty and return an empty string.
 * @returns Plain text with all HTML markup removed and entities decoded.
 */
export function sanitise(html: string | null | undefined): string {
  // Guard: null or undefined input returns empty string.
  if (html == null) return '';

  // 1. Remove <script> and <style> elements and their content.
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');

  // 2. Strip all remaining HTML tags and attributes.
  text = text.replace(/<[^>]+>/g, ' ');

  // 3. Decode HTML entities (both named and numeric).
  text = he.decode(text);

  // 4. Normalise whitespace (collapse runs of whitespace to a single space).
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}
