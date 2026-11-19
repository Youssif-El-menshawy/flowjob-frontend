import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// An unreachable server and an expired session are different things: the first keeps the user signed in and shows a
// clear error, the second signs them out. Every case below stubs fetch; nothing reaches a real server.

const anna = { id: 'a', name: 'Anna', email: 'anna@example.com', createdAt: '2026-01-01' };
const session = (accessToken = 'fixture-token') => Response.json({ accessToken, user: anna });
const denied = () => Response.json({ detail: 'Invalid or expired token' }, { status: 401 });
const offline = () => { throw new TypeError('Failed to fetch'); };
const gateway = (status = 502) => new Response('Bad Gateway', { status, headers: { 'Content-Type': 'text/plain' } });
const is = (url: string, path: string) => url.endsWith(path);

let client: typeof import('./client');
let pendingJob: typeof import('@/shared/lib/pendingJob').pendingJob;

beforeEach(async () => {
  sessionStorage.clear();
  vi.resetModules();
  client = await import('./client');
  ({ pendingJob } = await import('@/shared/lib/pendingJob'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

async function signedIn() {
  vi.stubGlobal('fetch', vi.fn(async () => session()));
  await client.authSession.login(anna.email, 'synthetic password');
  pendingJob.set('Junior Developer at Example Ltd');
}

describe('network failure (server unreachable)', () => {
  it('rejects a request with a clear error and keeps the user signed in', async () => {
    await signedIn();
    vi.stubGlobal('fetch', vi.fn(async () => offline()));

    const error = await client.api('/applications').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(client.ServerUnavailableError);
    expect(error).toBeInstanceOf(client.ApiError); // screens that show ApiError messages show this one too
    expect((error as Error).message).toBe(client.SERVER_UNAVAILABLE_MESSAGE);
    expect(client.authSession.getSnapshot()).toEqual({ status: 'authenticated', user: anna });
    expect(client.serverConnection.getSnapshot()).toBe(false);
    expect(pendingJob.get()).toBe('Junior Developer at Example Ltd'); // tab data is not cleared
  });

  it('keeps the session when the refresh after a 401 cannot reach the server, and recovers later', async () => {
    await signedIn();
    let refreshCalls = 0;
    let serverUp = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (is(url, '/auth/refresh')) {
        refreshCalls++;
        return serverUp ? session('fresh-token') : offline();
      }
      const token = new Headers(init.headers).get('Authorization');
      return token === 'Bearer fresh-token' ? Response.json([{ id: 'app1' }]) : denied();
    }));

    await expect(client.api('/applications')).rejects.toBeInstanceOf(client.ServerUnavailableError);
    expect(client.authSession.getSnapshot().status).toBe('authenticated');
    expect(pendingJob.get()).toBe('Junior Developer at Example Ltd');

    serverUp = true;
    await expect(client.api('/applications')).resolves.toEqual([{ id: 'app1' }]);
    expect(refreshCalls).toBe(2);
    expect(client.authSession.getSnapshot().status).toBe('authenticated');
    expect(client.serverConnection.getSnapshot()).toBe(true);
  });

  it.each([502, 503, 504])('treats a gateway %i without a FlowJob body as unreachable', async (status) => {
    await signedIn();
    vi.stubGlobal('fetch', vi.fn(async () => gateway(status)));

    await expect(client.api('/cvs')).rejects.toBeInstanceOf(client.ServerUnavailableError);
    expect(client.authSession.getSnapshot().status).toBe('authenticated');
  });

  it('keeps the session when the refresh endpoint fails with a server error', async () => {
    await signedIn();
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      is(url, '/auth/refresh') ? new Response('Internal Server Error', { status: 500 }) : denied()));

    await expect(client.api('/cvs')).rejects.toBeInstanceOf(client.ServerUnavailableError);
    expect(client.authSession.getSnapshot().status).toBe('authenticated');
  });

  it('keeps FlowJob’s own 503 errors (for example a busy PDF renderer) as normal API errors', async () => {
    await signedIn();
    vi.stubGlobal('fetch', vi.fn(async () =>
      Response.json({ detail: 'PDF rendering is busy. Please try again shortly.' }, { status: 503 })));

    const error = await client.apiBlob('/cvs/one/pdf').catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(client.ServerUnavailableError);
    expect(error).toMatchObject({ status: 503, message: 'PDF rendering is busy. Please try again shortly.' });
    expect(client.serverConnection.getSnapshot()).toBe(true);
  });

  it('marks a first session check that cannot reach the server as unavailable, not signed out', async () => {
    pendingJob.set('Pasted before signing up');
    vi.stubGlobal('fetch', vi.fn(async () => offline()));

    client.authSession.initialize();
    await vi.waitFor(() => expect(client.authSession.getSnapshot().status).toBe('unavailable'));
    expect(pendingJob.get()).toBe('Pasted before signing up');

    vi.stubGlobal('fetch', vi.fn(async () => session()));
    client.authSession.retry();
    await vi.waitFor(() => expect(client.authSession.getSnapshot()).toEqual({ status: 'authenticated', user: anna }));
  });

  it('treats an auth request that times out as unreachable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));

    client.authSession.initialize();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.authSession.getSnapshot().status).toBe('unavailable');
  });

  it('shows the clear message when logging in while the server is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => offline()));
    await expect(client.authSession.login(anna.email, 'synthetic password'))
      .rejects.toThrow(client.SERVER_UNAVAILABLE_MESSAGE);
    expect(client.authSession.getSnapshot().status).toBe('anonymous');
  });

  it('keeps a request cancelled by the caller as a cancellation, not an outage', async () => {
    await signedIn();
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));

    const pending = client.api('/matches', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.serverConnection.getSnapshot()).toBe(true);
  });
});

describe('normal session expiration (server answers)', () => {
  it('signs the user out and clears tab data when the server rejects the refresh', async () => {
    await signedIn();
    vi.stubGlobal('fetch', vi.fn(async () => denied()));

    await expect(client.api('/applications')).rejects.toMatchObject({ status: 401 });
    expect(client.authSession.getSnapshot()).toEqual({ status: 'anonymous', user: null });
    expect(pendingJob.get()).toBe('');
    expect(client.serverConnection.getSnapshot()).toBe(true);
  });

  it('lands a first visit with no session on signed-out, not unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => denied()));
    client.authSession.initialize();
    await vi.waitFor(() => expect(client.authSession.getSnapshot().status).toBe('anonymous'));
  });
});
