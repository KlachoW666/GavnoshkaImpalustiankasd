/**
 * Centralized API client — consistent fetch, error handling, base URL.
 * On 401, optional onUnauthorized callback is invoked (e.g. logout).
 * Token is auto-injected from localStorage when present (same key as AuthContext).
 */

const API_BASE = '/api';
const TOKEN_KEY = 'cryptosignal-auth-token';

export interface ApiError {
  error: string;
  stack?: string;
}

let onUnauthorized: (() => void) | null = null;

export function setApiUnauthorizedCallback(cb: () => void): void {
  onUnauthorized = cb;
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function defaultHeaders(overrides?: HeadersInit): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...overrides
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({})) as T & ApiError;
  if (res.status === 401) {
    onUnauthorized?.();
  }
  if (!res.ok) {
    const msg = (data as ApiError).error || res.statusText || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  async get<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: defaultHeaders(options?.headers as HeadersInit)
    });
    return handleResponse<T>(res);
  },

  async post<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      method: 'POST',
      headers: defaultHeaders(options?.headers as HeadersInit),
      body: body != null ? JSON.stringify(body) : (options?.body ?? undefined)
    });
    return handleResponse<T>(res);
  },

  async patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      method: 'PATCH',
      headers: defaultHeaders(options?.headers as HeadersInit),
      body: body != null ? JSON.stringify(body) : (options?.body ?? undefined)
    });
    return handleResponse<T>(res);
  }
};
