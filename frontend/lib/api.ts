/**
 * Typed API client for the Express backend.
 *
 * `apiFetch` wraps the native `fetch` API with:
 *   - Automatic `Authorization: Bearer <token>` header from localStorage.
 *   - JSON serialisation for request bodies.
 *   - 401 handling: clears the stored token and redirects to /login
 *     (Requirement 1.5).
 *   - Returns a typed response body on success or throws an `ApiError`.
 */
import { getToken, removeToken } from './auth';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// ─── ApiError ─────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly status: number;
  /** Field name returned by the backend for validation errors. */
  readonly field?: string;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = field;
  }
}

// ─── apiFetch ─────────────────────────────────────────────────────────────────

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  /** Request body — will be JSON-serialised. */
  body?: unknown;
}

/**
 * Perform a typed fetch to the backend API.
 *
 * @param path   Path relative to the API base URL, e.g. '/auth/login'.
 * @param options Standard RequestInit options, plus a typed `body`.
 * @returns Parsed JSON response body as T.
 * @throws ApiError on non-2xx responses.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string> | undefined),
  };

  // Attach Bearer token if one is stored (Requirement 1.4).
  const token = getToken();
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 401 — clear token and redirect to login (Requirement 1.5).
  if (response.status === 401) {
    removeToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  // Parse body; handle cases where response may have no body (e.g. 204).
  let data: unknown;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorBody = data as { error?: string; field?: string };
    throw new ApiError(
      response.status,
      errorBody?.error ?? `HTTP ${response.status}`,
      errorBody?.field
    );
  }

  return data as T;
}

// ─── Auth-specific typed helpers ──────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: { id: string; email: string };
}

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export function register(payload: RegisterPayload): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: payload,
  });
}

export function login(payload: LoginPayload): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: payload,
  });
}
