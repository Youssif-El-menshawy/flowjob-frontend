import { clearTemporaryJobData } from '@/shared/lib/sessionData';
import type { ApiErrorBody, AuthResponse, User } from './types';

// The FastAPI backend. In development /api/v1 goes through the Vite proxy to localhost:8000.
export const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.fieldErrors = body.fieldErrors;
  }
}

export const SERVER_UNAVAILABLE_MESSAGE = 'Can’t reach the FlowJob server. Check your connection and try again.';

/**
 * The backend could not be reached: a network failure, an auth request timing out, or a gateway (the dev proxy or a
 * production reverse proxy) answering 502/503/504 without a FlowJob error body. This is never treated as an
 * expired session, so the user stays signed in and can retry. Status 0 marks it as "no answer from FlowJob".
 */
export class ServerUnavailableError extends ApiError {
  constructor() {
    super(0, { message: SERVER_UNAVAILABLE_MESSAGE });
    this.name = 'ServerUnavailableError';
  }
}

// Whether the last request reached the backend. A banner shows while it is false; any answer from FlowJob clears it.
let serverReachable = true;
const connectionListeners = new Set<() => void>();
function setServerReachable(reachable: boolean) {
  if (serverReachable === reachable) return;
  serverReachable = reachable;
  connectionListeners.forEach((listener) => listener());
}
export const serverConnection = {
  getSnapshot: () => serverReachable,
  subscribe(listener: () => void) {
    connectionListeners.add(listener);
    return () => { connectionListeners.delete(listener); };
  },
};

const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** A 502/503/504 that did not come from FlowJob itself (FlowJob errors always carry a JSON message). */
async function isGatewayFailure(response: Response): Promise<boolean> {
  if (!GATEWAY_STATUSES.has(response.status)) return false;
  try {
    const body = await response.clone().json();
    return !(typeof body?.message === 'string' || typeof body?.detail === 'string' || Array.isArray(body?.detail));
  } catch {
    return true;
  }
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

type ApiInit = RequestInit & { json?: unknown };
// 'unavailable': the first session check could not reach the server, so it is unknown whether anyone is signed in.
type Session = { status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable'; user: User | null };

// Bearer credentials stay in memory. A session generation identifies the user
// context, while a token version changes even when a refresh reissues the same JWT.
let session: Session = { status: 'loading', user: null };
let accessToken: string | null = null;
let generation = 0;
let tokenVersion = 0;
let refreshing: { generation: number; result: Promise<RefreshOutcome> } | null = null;
let cookieWork: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function publish(next: Session) {
  session = next;
  listeners.forEach((listener) => listener());
}

function expireSession() {
  // Only the end of a signed-in session clears tab data: a visitor's first load also lands here, and the job they
  // pasted before signing up must survive it.
  const signedIn = session.status === 'authenticated';
  generation++;
  accessToken = null;
  if (signedIn) clearTemporaryJobData();
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
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
  try {
    return await work(controller.signal);
  } catch (error) {
    // A server that does not answer auth requests in time is unreachable, not a reason to sign anyone out.
    if (timedOut && isAbort(error)) {
      setServerReachable(false);
      throw new ServerUnavailableError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function send(path: string, init: ApiInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  } catch (error) {
    if (isAbort(error)) throw error; // cancelled by the caller (or an auth timeout, handled above)
    setServerReachable(false);
    throw new ServerUnavailableError();
  }
  setServerReachable(!await isGatewayFailure(response));
  return response;
}

type RefreshOutcome = 'refreshed' | 'expired' | 'unavailable' | 'superseded';

function refreshSession(started: number): Promise<RefreshOutcome> {
  if (refreshing?.generation === started) return refreshing.result;

  const result = withCookie(async (): Promise<RefreshOutcome> => {
    if (generation !== started || session.status === 'anonymous') return 'superseded';
    let refreshed: AuthResponse | null = null;
    let unavailable = false;
    try {
      refreshed = await withAuthTimeout(async (signal) => {
        const response = await send('/auth/refresh', { method: 'POST', signal }, null);
        // A 5xx means the server could not decide (backend or database down), so the session is not known to be over.
        if (response.status >= 500) throw new ServerUnavailableError();
        return response.ok ? checkAuthResponse(await response.json()) : null;
      });
    } catch (error) {
      // Only an unreachable server keeps the session. A malformed session response settles it like an expired cookie.
      unavailable = error instanceof ServerUnavailableError;
    }
    if (generation !== started) return 'superseded';
    if (unavailable) {
      if (session.status === 'loading') publish({ status: 'unavailable', user: null });
      return 'unavailable';
    }
    if (!refreshed) {
      expireSession();
      return 'expired';
    }
    if (session.user && session.user.id !== refreshed.user.id) generation++;
    acceptSession(refreshed);
    return generation === started ? 'refreshed' : 'superseded';
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
  if (session.status === 'loading' || session.status === 'unavailable') publish({ status: 'anonymous', user: null });
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
  /** Check the session again after the server was unreachable on the first check. */
  retry() {
    if (session.status !== 'unavailable') return;
    publish({ status: 'loading', user: null });
    void refreshSession(generation);
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
  if (first.version === tokenVersion) {
    const outcome = await refreshSession(started);
    // The user stays signed in: a later request refreshes again once the server answers.
    if (outcome === 'unavailable') throw new ServerUnavailableError();
    if (outcome !== 'refreshed') return first.response;
  }
  assertSession(started);

  const retry = await attempt();
  if (retry.response.status === 401 && retry.version === tokenVersion) expireSession();
  return retry.response;
}

async function responseError(res: Response, path: string, fallback: string): Promise<ApiError> {
  if (await isGatewayFailure(res)) return new ServerUnavailableError();
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
