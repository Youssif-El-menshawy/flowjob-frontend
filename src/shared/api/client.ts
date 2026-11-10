import type { ApiErrorBody, AuthResponse } from './types';

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
export const API_URL = USE_MOCKS ? '/api/v1' : (import.meta.env.VITE_API_URL ?? '/api/v1');

/** Access token lives in memory only. The refresh token is an httpOnly cookie set by the server. */
let accessToken: string | null = null;
export const tokenStore = {
  get: () => accessToken,
  set: (t: string | null) => {
    accessToken = t;
  },
};

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.fieldErrors = body.fieldErrors;
  }
}

let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

export async function refreshSession(): Promise<AuthResponse | null> {
  const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) {
    tokenStore.set(null);
    return null;
  }
  const data = (await res.json()) as AuthResponse;
  tokenStore.set(data.accessToken);
  return data;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = refreshSession()
      .then((r) => !!r)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function responseError(res: Response, path: string, fallback: string): Promise<ApiError> {
  let body: ApiErrorBody = { message: fallback };
  try {
    const parsed = await res.json();
    if (typeof parsed.message === 'string') body = parsed;
    else if (typeof parsed.detail === 'string') body = { message: parsed.detail };
    else if (Array.isArray(parsed.detail)) {
      const issues = parsed.detail
        .filter((item: { loc?: unknown; msg?: unknown }) => Array.isArray(item.loc) && typeof item.msg === 'string') as
        { loc: (string | number)[]; msg: string }[];
      const first = issues[0];
      const field = first?.loc.slice(1).join('.');
      const cvRequest = path === '/cvs' || path.startsWith('/cvs/');
      body = {
        message: cvRequest && first
          ? `${field ? `${field}: ` : ''}${first.msg}`
          : 'Please check the highlighted fields.',
        fieldErrors: Object.fromEntries(issues.map((item) => [item.loc.at(-1)!, item.msg])),
      };
    }
  } catch {
    /* keep default */
  }
  return new ApiError(res.status, body);
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return api<T>(path, init, false);
    onSessionExpired?.();
  }
  if (!res.ok) throw await responseError(res, path, 'Something went wrong. Please try again.');
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Like `api`, but returns the raw response body as a Blob (e.g. a generated PDF). */
export async function apiBlob(
  path: string,
  init: RequestInit & { json?: unknown } = {},
  retry = true,
): Promise<Blob> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return apiBlob(path, init, false);
    onSessionExpired?.();
  }
  if (!res.ok) throw await responseError(res, path, 'Could not generate the PDF. Please try again.');
  return res.blob();
}
