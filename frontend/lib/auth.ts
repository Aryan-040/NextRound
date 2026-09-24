/**
 * JWT storage helpers.
 *
 * All three functions are safe to call during SSR — they guard against
 * `window` being undefined (Next.js server environment).
 *
 * The token is stored under the key 'token' in localStorage.
 * Requirement 1.7: logout removes the token, causing subsequent protected
 * requests to return 401.
 */

const TOKEN_KEY = 'token';

/**
 * Returns the stored JWT, or null if none is set or the environment is SSR.
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Persists a signed JWT to localStorage.
 */
export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Removes the JWT from localStorage.
 * Called on logout (Requirement 1.7) and on 401 responses (Requirement 1.5).
 */
export function removeToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}
