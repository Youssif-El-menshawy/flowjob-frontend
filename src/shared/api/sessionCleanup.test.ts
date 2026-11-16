import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const anna = { id: 'a', name: 'Anna', email: 'anna@example.com', createdAt: '2026-01-01' };
const session = () => Response.json({ accessToken: 'fixture-token', user: anna });
const denied = () => Response.json({ detail: 'Invalid or expired token' }, { status: 401 });
const is = (url: string, path: string) => url.endsWith(path);

let client: typeof import('./client');
let jobPosts: typeof import('@/shared/lib/jobPosts').jobPosts;
let pendingJob: typeof import('@/shared/lib/pendingJob').pendingJob;

function fillTab() {
  pendingJob.set('Junior Developer at Example Ltd');
  jobPosts.remember('m1', 'We are hiring a junior developer with React.');
  sessionStorage.setItem('flowjob.tailorReview.d1', JSON.stringify({ decisions: {}, edits: { s1: 'My edit' }, confirmed: true }));
  sessionStorage.setItem('flowjob.tailorReview.d2', '{}');
  sessionStorage.setItem('unrelated.key', 'kept');
}

const flowjobKeys = () =>
  Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i)).filter((k) => k?.startsWith('flowjob.'));

beforeEach(async () => {
  sessionStorage.clear();
  vi.resetModules();
  client = await import('./client');
  ({ jobPosts } = await import('@/shared/lib/jobPosts'));
  ({ pendingJob } = await import('@/shared/lib/pendingJob'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('temporary job and tailoring data in the tab', () => {
  it('is cleared on logout, leaving other storage alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      is(url, '/auth/login') ? session() : new Response(null, { status: 204 })));
    await client.authSession.login('anna@example.com', 'fixture-password');
    fillTab();

    await client.authSession.logout();

    expect(flowjobKeys()).toEqual([]);
    expect(jobPosts.get('m1')).toBeUndefined();
    expect(pendingJob.get()).toBe('');
    expect(sessionStorage.getItem('unrelated.key')).toBe('kept');
  });

  it('is cleared when a signed-in session expires', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (is(url, '/auth/login')) return session();
      return denied(); // the API rejects the token and the refresh cookie is gone
    }));
    await client.authSession.login('anna@example.com', 'fixture-password');
    fillTab();

    await expect(client.api('/applications')).rejects.toThrow();

    expect(client.authSession.getSnapshot().status).toBe('anonymous');
    expect(flowjobKeys()).toEqual([]);
  });

  it("keeps a visitor's pasted job through the first anonymous load, so sign-up can still use it", async () => {
    pendingJob.set('Junior Developer at Example Ltd');
    vi.stubGlobal('fetch', vi.fn(async () => denied()));

    client.authSession.initialize();
    await vi.waitFor(() => expect(client.authSession.getSnapshot().status).toBe('anonymous'));

    expect(pendingJob.get()).toBe('Junior Developer at Example Ltd');
  });
});
