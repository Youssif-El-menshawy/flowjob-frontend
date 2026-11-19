import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const anna = { id: 'a', name: 'Anna', email: 'anna@example.com', createdAt: '2026-01-01' };
const bob = { ...anna, id: 'b', name: 'Bob', email: 'bob@example.com' };
const session = (accessToken = 'fixture-token', user = anna) => Response.json({ accessToken, user });
const denied = () => Response.json({ detail: 'Invalid or expired token' }, { status: 401 });
const done = () => new Response(null, { status: 204 });
const is = (url: string, path: string) => url.endsWith(path);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

let client: typeof import('./client');
beforeEach(async () => {
  vi.resetModules();
  client = await import('./client');
});
afterEach(() => vi.unstubAllGlobals());

describe('shared authenticated transport', () => {
  it('shares one refresh between simultaneous JSON and PDF requests and preserves request options', async () => {
    const refreshing = deferred<Response>();
    const signal = new AbortController().signal;
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (is(url, '/auth/login')) return session('old-token');
      if (is(url, '/auth/refresh')) return refreshing.promise;
      const headers = new Headers(init.headers);
      expect(init.credentials).toBe('include');
      if (is(url, '/cvs/preview/pdf')) {
        expect(init.method).toBe('POST');
        expect(init.body).toBe(JSON.stringify({ content: {} }));
        expect(init.signal).toBe(signal);
        expect(headers.get('Content-Type')).toBe('application/json');
      }
      if (headers.get('Authorization') === 'Bearer old-token') return denied();
      expect(headers.get('Authorization')).toBe('Bearer rotated-token');
      return is(url, '/cvs/preview/pdf') ? new Response('%PDF-fixture') : Response.json({ id: 'a' });
    });
    vi.stubGlobal('fetch', fetcher);
    await client.authSession.login(anna.email, 'synthetic password');

    const json = client.api<{ id: string }>('/me');
    const pdf = client.apiBlob('/cvs/preview/pdf', { method: 'POST', json: { content: {} }, signal });
    await vi.waitFor(() => expect(fetcher.mock.calls.filter(([url]) => is(url, '/auth/refresh'))).toHaveLength(1));
    refreshing.resolve(session('rotated-token'));

    expect(await json).toEqual({ id: 'a' });
    expect(await (await pdf).text()).toBe('%PDF-fixture');
    expect(fetcher.mock.calls.filter(([url]) => is(url, '/auth/refresh'))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => is(url, '/cvs/preview/pdf'))).toHaveLength(2);
  });

  it('reuses the refreshed session for a late 401 even if the JWT text was reissued unchanged', async () => {
    const late = deferred<Response>();
    let meCalls = 0;
    let pdfCalls = 0;
    let refreshCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (is(url, '/auth/login')) return session();
      if (is(url, '/auth/refresh')) {
        refreshCalls++;
        return session();
      }
      if (is(url, '/cvs/one/pdf')) return ++pdfCalls === 1 ? late.promise : new Response('%PDF-fixture');
      return ++meCalls === 1 ? denied() : Response.json({ id: 'a' });
    }));
    await client.authSession.login(anna.email, 'synthetic password');
    const pdf = client.apiBlob('/cvs/one/pdf');
    await expect(client.api('/me')).resolves.toEqual({ id: 'a' });
    late.resolve(denied());
    expect(await (await pdf).text()).toBe('%PDF-fixture');
    expect([refreshCalls, pdfCalls, meCalls]).toEqual([1, 2, 2]);
  });

  // A network failure is NOT an expired session: see serverUnavailable.test.ts.
  it.each(['http', 'malformed'])('settles a %s refresh failure once and leaves no stale credentials', async (failure) => {
    let refreshCalls = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (is(url, '/auth/login')) return session();
      if (is(url, '/auth/refresh')) {
        refreshCalls++;
        if (failure === 'malformed') return Response.json({ accessToken: 'incomplete-fixture' });
      }
      return denied();
    });
    vi.stubGlobal('fetch', fetcher);
    await client.authSession.login(anna.email, 'synthetic password');
    const observed = vi.fn();
    const stop = client.authSession.subscribe(observed);

    await Promise.all([
      expect(client.api('/me')).rejects.toMatchObject({ status: 401 }),
      expect(client.apiBlob('/cvs/one/pdf')).rejects.toMatchObject({ status: 401 }),
    ]);
    expect(client.authSession.getSnapshot()).toEqual({ status: 'anonymous', user: null });
    expect(observed).toHaveBeenCalledTimes(1);
    expect(refreshCalls).toBe(1);
    await expect(client.api('/profile')).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(1);
    stop();
  });

  it('does not refresh authentication endpoints and retries protected requests at most once', async () => {
    let allowLogin = false;
    const fetcher = vi.fn(async (url: string) => {
      if (is(url, '/auth/login') && allowLogin) return session('old-token');
      if (is(url, '/auth/refresh')) return session('new-token');
      return denied();
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(client.authSession.login(anna.email, 'wrong-fixture')).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    allowLogin = true;
    await client.authSession.login(anna.email, 'synthetic password');
    await expect(client.api('/me')).rejects.toMatchObject({ status: 401 });
    expect(fetcher.mock.calls.filter(([url]) => is(url, '/auth/refresh'))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => is(url, '/me'))).toHaveLength(2);
    expect(client.authSession.getSnapshot().status).toBe('anonymous');
  });

  it('clears local state immediately on logout and revokes the cookie issued by an in-flight refresh', async () => {
    const pending = deferred<void>();
    let cookie = 'old-cookie';
    const fetcher = vi.fn(async (url: string) => {
      if (is(url, '/auth/login')) return session('old-token');
      if (is(url, '/auth/refresh')) {
        await pending.promise;
        cookie = 'rotated-cookie';
        return session('new-token');
      }
      if (is(url, '/auth/logout')) {
        expect(cookie).toBe('rotated-cookie');
        cookie = '';
        return done();
      }
      return denied();
    });
    vi.stubGlobal('fetch', fetcher);
    await client.authSession.login(anna.email, 'synthetic password');
    const rejected = expect(client.api('/me')).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(fetcher.mock.calls.some(([url]) => is(url, '/auth/refresh'))).toBe(true));
    const logout = client.authSession.logout();
    expect(client.authSession.getSnapshot()).toEqual({ status: 'anonymous', user: null });
    expect(fetcher.mock.calls.some(([url]) => is(url, '/auth/logout'))).toBe(false);
    pending.resolve();
    await logout;
    await rejected;
    expect(cookie).toBe('');
    expect(client.authSession.getSnapshot().status).toBe('anonymous');
    expect(fetcher.mock.calls.filter(([url]) => is(url, '/me'))).toHaveLength(1);
  });

  it('does not replay an old account request under a different account returned by refresh', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (is(url, '/auth/login')) return session();
      if (is(url, '/auth/refresh')) return session('bob-token', bob);
      return denied();
    });
    vi.stubGlobal('fetch', fetcher);
    await client.authSession.login(anna.email, 'synthetic password');
    await expect(client.api('/profile', { method: 'PUT', json: {} })).rejects.toMatchObject({ status: 401 });
    expect(fetcher.mock.calls.filter(([url]) => is(url, '/profile'))).toHaveLength(1);
    expect(client.authSession.getSnapshot().user?.id).toBe(bob.id);
  });

  it('discards a response whose body finishes after logout', async () => {
    const oldBody = deferred<object>();
    const parse = vi.fn(() => oldBody.promise);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (is(url, '/auth/login')) return session();
      if (is(url, '/auth/logout')) return done();
      return { ok: true, status: 200, json: parse };
    }));
    await client.authSession.login(anna.email, 'synthetic password');
    const rejected = expect(client.api('/profile')).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
    await client.authSession.logout();
    oldBody.resolve({ owner: anna.id });
    await rejected;
  });

  it('allows an explicit login after a failed logout without resurrecting the old session', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (is(url, '/auth/login')) return session('bob-token', bob);
      if (is(url, '/auth/logout')) throw new TypeError('synthetic offline failure');
      return denied();
    }));
    await expect(client.authSession.logout()).rejects.toBeInstanceOf(client.ServerUnavailableError);
    expect(client.authSession.getSnapshot().status).toBe('anonymous');
    await expect(client.authSession.login(bob.email, 'synthetic password')).resolves.toEqual(bob);
  });

  it('can refresh and retry a password change without blocking the cookie queue', async () => {
    let passwordRequests = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (is(url, '/auth/login')) return session('old-token');
      if (is(url, '/auth/refresh')) return session('new-token');
      return ++passwordRequests === 1 ? denied() : done();
    }));
    await client.authSession.login(anna.email, 'synthetic password');
    await expect(client.api('/me/password', { method: 'POST', json: {} })).resolves.toBeUndefined();
    expect(passwordRequests).toBe(2);
  });
});
