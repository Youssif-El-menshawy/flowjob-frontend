import type { ApiErrorBody, AuthResponse, User } from './types';

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
export const API_URL = USE_MOCKS ? '/api/v1' : (import.meta.env.VITE_API_URL ?? '/api/v1');

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.fieldErrors = body.fieldErrors;
  }
}

type ApiInit = RequestInit & { json?: unknown };
type Session = { status: 'loading' | 'authenticated' | 'anonymous'; user: User | null };

// Bearer credentials stay in memory. A session generation identifies the user
// context, while a token version changes even when a refresh reissues the same JWT.
let session: Session = { status: 'loading', user: null };
let accessToken: string | null = null;
let generation = 0;
let tokenVersion = 0;
let refreshing: { generation: number; result: Promise<boolean> } | null = null;
let cookieWork: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function publish(next: Session) {
  session = next;
  listeners.forEach((listener) => listener());
}

function expireSession() {
  generation++;
  accessToken = null;
  publish({ status: 'anonymous', user: null });
}

function acceptSession(response: AuthResponse) {
  accessToken = response.accessToken;
  tokenVersion++;
  publish({ status: 'authenticated', user: response.user });
}

function checkAuthResponse(value: AuthResponse | null): AuthResponse {
  if (!value || typeof value.accessToken !== 'string' || !value.accessToken ||
      !value.user || typeof value.user.id !== 'string' || !value.user.id ||
      typeof value.user.name !== 'string' || typeof value.user.email !== 'string' ||
      typeof value.user.createdAt !== 'string') {
    throw new ApiError(502, { message: 'Could not establish a session. Please try again.' });
  }
  return value;
}

// A logout waits until the browser has received any rotated cookie, then revokes
// that cookie. A rejected operation cannot prevent later operations from running.
function withCookie<T>(work: () => Promise<T>): Promise<T> {
  const result = cookieWork.then(work);
  cookieWork = result.then(() => undefined, () => undefined);
  return result;
}

async function withAuthTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function send(path: string, init: ApiInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
}

function refreshSession(started: number): Promise<boolean> {
  if (refreshing?.generation === started) return refreshing.result;

  const result = withCookie(async () => {
    if (generation !== started || session.status === 'anonymous') return false;
    let refreshed: AuthResponse | null = null;
    try {
      refreshed = await withAuthTimeout(async (signal) => {
        const response = await send('/auth/refresh', { method: 'POST', signal }, null);
        return response.ok ? checkAuthResponse(await response.json()) : null;
      });
    } catch {
      // A network or response error settles the session the same way as an expired cookie.
    }
    if (generation !== started) return false;
    if (!refreshed) {
      expireSession();
      return false;
    }
    if (session.user && session.user.id !== refreshed.user.id) generation++;
    acceptSession(refreshed);
    return generation === started;
  }).finally(() => {
    if (refreshing?.result === result) refreshing = null;
  });
  refreshing = { generation: started, result };
  return result;
}

function assertSession(started: number) {
  if (generation !== started) throw new DOMException('Session changed', 'AbortError');
}

async function signIn(path: '/auth/login' | '/auth/register', json: object): Promise<User> {
  const started = ++generation;
  if (session.status === 'loading') publish({ status: 'anonymous', user: null });
  return withCookie(async () => {
    assertSession(started);
    const response = checkAuthResponse(await withAuthTimeout((signal) =>
      api<AuthResponse>(path, { method: 'POST', json, signal }),
    ));
    assertSession(started);
    generation++;
    acceptSession(response);
    return response.user;
  });
}

export const authSession = {
  getSnapshot: () => session,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  initialize() {
    if (session.status === 'loading') void refreshSession(generation);
  },
  login: (email: string, password: string) => signIn('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => signIn('/auth/register', { name, email, password }),
  logout() {
    expireSession();
    return withCookie(() => withAuthTimeout((signal) => api<void>('/auth/logout', { method: 'POST', signal })));
  },
  setUser(user: User) {
    if (session.user?.id === user.id) publish({ status: 'authenticated', user });
  },
};

const isAuthRoute = (path: string) => path.startsWith('/auth/');

async function request(path: string, init: ApiInit): Promise<Response> {
  if (isAuthRoute(path)) return send(path, init, accessToken);

  const started = generation;
  const perform = async () => {
    assertSession(started);
    if (init.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    const version = tokenVersion;
    const response = await send(path, init, accessToken);
    assertSession(started);
    return { response, version };
  };
  // Password changes also replace the refresh cookie.
  const attempt = () => path === '/me/password' ? withCookie(perform) : perform();

  const first = await attempt();
  if (first.response.status !== 401 || session.status === 'anonymous') return first.response;
  if (init.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  if (first.version === tokenVersion && !await refreshSession(started)) return first.response;
  assertSession(started);

  const retry = await attempt();
  if (retry.response.status === 401 && retry.version === tokenVersion) expireSession();
  return retry.response;
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

async function readResponse<T>(
  path: string, init: ApiInit, fallback: string, parse: (response: Response) => Promise<T>,
): Promise<T> {
  const started = generation;
  const res = await request(path, init);
  if (!res.ok) throw await responseError(res, path, fallback);
  const value = await parse(res);
  if (!isAuthRoute(path)) assertSession(started);
  return value;
}

export function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  return readResponse(path, init, 'Something went wrong. Please try again.', async (res) =>
    res.status === 204 ? undefined as T : (await res.json()) as T,
  );
}

/** Like `api`, but returns the raw response body as a Blob (e.g. a generated PDF). */
export function apiBlob(path: string, init: ApiInit = {}): Promise<Blob> {
  return readResponse(path, init, 'Could not generate the PDF. Please try again.', (res) => res.blob());
}
