// Demo mode keeps a working Gmail flow on the same contract as the real API (MSW, no Google or OpenAI).
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Application, GmailReview, GmailStatus } from '@/shared/api/types';
import { db, issueTokens, resetDemo } from './db';
import { handlers } from './handlers';

const server = setupServer(...handlers);
let token = '';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  resetDemo();
  token = issueTokens('user-demo');
});

async function call<T>(method: string, path: string, json?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(new URL(`/api/v1${path}`, window.location.href), {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? (undefined as T) : ((await res.json()) as T) };
}

it('serves status, reviews, approval, disconnect and reconnect in the demo', async () => {
  const status = (await call<GmailStatus>('GET', '/gmail')).body;
  expect(status.connection.state).toBe('active');
  expect(status.pendingReviewCount).toBe(1);

  const [review] = (await call<GmailReview[]>('GET', '/gmail/reviews')).body;
  expect(review.kind).toBe('status_change');
  expect(review.proposal.to).toBe('Offer');
  expect((await call('POST', `/gmail/reviews/${review.id}/approve`, {})).status).toBe(200);
  const allegro = db().data['user-demo'].applications.find((a: Application) => a.company === 'Allegro')!;
  expect(allegro.status).toBe('Offer');
  expect((await call<GmailStatus>('GET', '/gmail')).body.pendingReviewCount).toBe(0);

  expect((await call('DELETE', '/gmail')).status).toBe(204);
  expect((await call<GmailStatus>('GET', '/gmail')).body.connection.state).toBe('not_connected');

  const start = await call<{ authorizationUrl: string }>('POST', '/gmail/oauth/start', { mode: 'connect' });
  expect(start.body.authorizationUrl).toBe('/app/applications?gmail=connected');
  const [found] = (await call<GmailReview[]>('GET', '/gmail/reviews')).body;
  expect(found.kind).toBe('new_application');
  await call('POST', `/gmail/reviews/${found.id}/approve`, { jobTitle: 'Junior Developer (edited)' });
  const created = db().data['user-demo'].applications[0];
  expect([created.jobTitle, created.cvId, created.source]).toEqual(['Junior Developer (edited)', null, 'gmail']);

  const synced = await call<GmailStatus>('POST', '/gmail/sync', { retryFailed: false });
  expect(synced.status).toBe(202);
  expect(synced.body.sync?.lastRun?.reviews).toBe(1);
});
