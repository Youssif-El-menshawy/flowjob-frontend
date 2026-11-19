import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Through the real routes, auth provider and API client: only fetch is stubbed.
const denied = () => Response.json({ detail: 'Invalid or expired token' }, { status: 401 });
const offline = () => { throw new TypeError('Failed to fetch'); };

let fetcher: (url: string) => Response | Promise<Response>;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => fetcher(url)));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderApp(path: string) {
  const { appRoutes } = await import('./App');
  const { AuthProvider } = await import('@/features/auth/AuthProvider');
  const { ToastProvider } = await import('@/shared/ui/Overlay');
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

it('shows a clear unavailable page instead of logging out when the server is down, and retries', async () => {
  fetcher = offline;
  const router = await renderApp('/app/applications');

  expect(await screen.findByRole('heading', { name: 'FlowJob is unavailable right now.' })).toBeVisible();
  expect(screen.getAllByText(/Can’t reach the FlowJob server/).length).toBeGreaterThan(0);
  expect(router.state.location.pathname).toBe('/app/applications'); // not redirected to log in

  // The server is back and the session had ended: now (and only now) the user is sent to log in.
  fetcher = denied;
  expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1); // the page, without a duplicate banner
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(router.state.location.pathname).toBe('/login');
  expect(screen.queryByText(/Can’t reach the FlowJob server/)).not.toBeInTheDocument();
});

it('sends a visitor with no session to log in without any outage message', async () => {
  fetcher = denied;
  await renderApp('/app');
  expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(screen.queryByText(/Can’t reach the FlowJob server/)).not.toBeInTheDocument();
});

it('shows the outage message on the log-in form when the server is down', async () => {
  fetcher = denied;
  await renderApp('/login');
  await screen.findByRole('heading', { name: 'Welcome back.' });

  fetcher = offline;
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'fixture@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fixture-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

  const alerts = await screen.findAllByRole('alert');
  expect(alerts.some((alert) => /Can’t reach the FlowJob server/.test(alert.textContent ?? ''))).toBe(true);
});

it('keeps a signed-in user in the app with a banner while the server is down, and clears it after Try again', async () => {
  const user = { id: 'u1', name: 'Fixture User', email: 'fixture@example.test', createdAt: '2026-01-01' };
  const working = (url: string) => {
    const path = new URL(url, 'https://fixture.test').pathname.replace(/^\/api\/v1/, '');
    if (path === '/auth/refresh') return Response.json({ accessToken: 'fixture-token', user });
    if (path === '/gmail') {
      return Response.json({ available: false, pendingReviewCount: 0, connection: { state: 'not_connected' }, sync: null });
    }
    if (path === '/profile') return Response.json(null);
    return Response.json([]);
  };
  fetcher = working;
  const router = await renderApp('/app/settings');
  expect(await screen.findByRole('heading', { name: /settings/i })).toBeVisible();

  fetcher = offline;
  await router.navigate('/app/applications');
  expect(await screen.findByText(/Can’t reach the FlowJob server/)).toBeVisible();
  expect(router.state.location.pathname).toBe('/app/applications'); // still signed in, not sent to log in

  fetcher = working;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByText(/Can’t reach the FlowJob server/)).not.toBeInTheDocument());
  expect(router.state.location.pathname).toBe('/app/applications');
});
