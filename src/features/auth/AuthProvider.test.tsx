import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { authSession } from '@/shared/api/client';
import { AuthProvider, useAuth } from './AuthProvider';

afterEach(() => vi.unstubAllGlobals());

const anna = { id: 'a', name: 'Anna', email: 'anna@example.com', createdAt: '2026-01-01' };
const bob = { ...anna, id: 'b', name: 'Bob', email: 'bob@example.com' };

function Status() {
  const { status, user } = useAuth();
  return <p>{user?.name ?? status}</p>;
}

it('shares StrictMode bootstrap and remounts with the current session, including after logout', async () => {
  const qc = new QueryClient();
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/auth/refresh')) return Response.json({ accessToken: 'anna-token', user: anna });
    if (url.endsWith('/auth/login')) return Response.json({ accessToken: 'bob-token', user: bob });
    if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 });
    throw new Error('Unexpected fixture request.');
  });
  vi.stubGlobal('fetch', fetcher);
  const mount = () => render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <AuthProvider><Status /></AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
  const first = mount();
  expect(await screen.findByText('Anna')).toBeVisible();
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);

  qc.setQueryData(['private-cv'], 'owned by Anna');
  first.unmount();
  await authSession.login(bob.email, 'synthetic password');

  const second = mount();
  expect(screen.getByText('Bob')).toBeVisible();
  expect(qc.getQueryData(['private-cv'])).toBeUndefined();
  qc.setQueryData(['private-cv'], 'owned by Bob');
  await act(async () => { await authSession.logout(); });
  expect(screen.getByText('anonymous')).toBeVisible();
  expect(qc.getQueryData(['private-cv'])).toBeUndefined();
  second.unmount();

  mount();
  await waitFor(() => expect(screen.getByText('anonymous')).toBeVisible());
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
});
