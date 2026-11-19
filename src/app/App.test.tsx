import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchResult } from '@/shared/api/types';

const mocks = vi.hoisted(() => ({
  status: 'authenticated' as 'authenticated' | 'anonymous' | 'loading',
  matchIds: [] as (string | undefined)[],
}));

const match = {
  id: 'm1', cvId: 'cv1', cvName: 'Original CV', jobTitle: 'Backend Engineer', company: 'Acme', jobText: '',
  score: 78, verdict: 'Good fit', summary: 's', strengths: [], gaps: [], createdAt: '2026-02-01',
  scoreAvailable: true, overallAssessment: 'Solid.', matched: [], partiallyMatched: [], missing: [],
} as MatchResult;

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: mocks.status,
    user: { name: 'Jordan Example', email: 'jordan@example.com' },
    logout: vi.fn(),
    retry: vi.fn(),
  }),
}));
vi.mock('@/shared/api/queries', () => ({
  useApplications: () => ({ data: [] }),
  useGmail: () => ({ data: undefined }),
  useCvs: () => ({ data: [{ id: 'cv1', name: 'My CV', kind: 'original', updatedAt: '2026-01-01' }], isLoading: false }),
  useMatches: () => ({ data: [] }),
  useMatch: (id?: string) => {
    mocks.matchIds.push(id);
    return { data: match, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  },
  useRunMatch: () => ({ mutate: vi.fn(), isPending: false }),
  useTailor: () => ({ mutate: vi.fn(), isPending: false }),
  useTailorDirect: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/auth/LoginPage', () => ({ default: () => <div>LOGIN PAGE</div> }));
vi.mock('@/features/match/TailorPage', () => ({ default: () => <div>TAILOR PAGE</div> }));

import { appRoutes } from './App';
import { ToastProvider } from '@/shared/ui/Overlay';

function renderApp(entries: string[], index?: number) {
  const router = createMemoryRouter(appRoutes, { initialEntries: entries, initialIndex: index });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  mocks.status = 'authenticated';
  mocks.matchIds = [];
});

describe('Job Match route structure', () => {
  it.each(['/app/tailor/d1', '/app/match/m1/tailor'])('renders %s in the focused layout with no sidebar', async (path) => {
    renderApp([path]);
    expect(await screen.findByText('TAILOR PAGE')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Account menu/i })).toBeNull();
    expect(document.getElementById('app-sidebar')).toBeNull();
    expect(screen.getByRole('link', { name: /Back to Job Match/i })).toHaveAttribute('href', '/app/match');
  });

  it.each(['/app/tailor/d1', '/app/match/m1/tailor'])('keeps %s behind authentication', async (path) => {
    mocks.status = 'anonymous';
    renderApp([path]);
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('TAILOR PAGE')).toBeNull();
  });

  it('keeps the shared form offering both actions on /app/match', async () => {
    renderApp(['/app/match']);
    expect(await screen.findByRole('button', { name: 'Check my match' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tailor my CV' })).toBeInTheDocument();
  });

  it('renders the input page inside the normal layout, with the sidebar', async () => {
    renderApp(['/app/match']);
    expect(await screen.findByRole('button', { name: /Check my match/i })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByText('Job Match')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Account menu/i })).toBeInTheDocument();
  });

  it('renders the report WITHOUT the sidebar, account menu, or input form', async () => {
    renderApp(['/app/match/m1']);
    expect(await screen.findByRole('heading', { level: 1, name: 'Backend Engineer' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Account menu/i })).toBeNull();
    expect(screen.queryByLabelText('Job description')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    // Lightweight report chrome instead.
    expect(screen.getByRole('link', { name: /Back to Job Match/i })).toHaveAttribute('href', '/app/match');
    expect(screen.getByRole('link', { name: 'FlowJob home' })).toBeInTheDocument();
  });

  it('keeps the report sidebar-free (and toggle-free) whatever the sidebar preference is', async () => {
    for (const pref of ['true', 'false']) {
      localStorage.setItem('flowjob.sidebarCollapsed', pref);
      renderApp(['/app/match/m1']);
      expect(await screen.findByRole('heading', { level: 1, name: 'Backend Engineer' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
      expect(screen.queryByRole('button', { name: /(Collapse|Expand) sidebar/i })).toBeNull();
      expect(document.getElementById('app-sidebar')).toBeNull();
      cleanup();
    }
  });

  it('applies the stored collapsed preference to the normal layout (input page)', async () => {
    localStorage.setItem('flowjob.sidebarCollapsed', 'true');
    renderApp(['/app/match']);
    expect(await screen.findByRole('button', { name: /Check my match/i })).toBeInTheDocument();
    expect(document.getElementById('app-sidebar')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('supports deep links / refresh: the report loads straight from its URL id', async () => {
    renderApp(['/app/match/m1']);
    await screen.findByRole('heading', { level: 1, name: 'Backend Engineer' });
    expect(mocks.matchIds).toContain('m1');
  });

  it('keeps the report behind authentication', async () => {
    mocks.status = 'anonymous';
    renderApp(['/app/match/m1']);
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Backend Engineer' })).toBeNull();
  });

  it('"Back to Job Match" and browser Back both return to the input page', async () => {
    const router = renderApp(['/app/match', '/app/match/m1'], 1);
    await screen.findByRole('heading', { level: 1, name: 'Backend Engineer' });
    await act(() => router.navigate(-1));
    expect(await screen.findByRole('button', { name: /Check my match/i })).toBeInTheDocument();

    cleanup();
    renderApp(['/app/match/m1']);
    fireEvent.click(await screen.findByRole('link', { name: /Back to Job Match/i }));
    expect(await screen.findByRole('button', { name: /Check my match/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument(); // sidebar is back
  });

  it('"/app/match/:id/tailor" is not captured by the report route (shows tailoring, not the report)', async () => {
    renderApp(['/app/match/m1/tailor']);
    expect(await screen.findByText('TAILOR PAGE')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Backend Engineer' })).toBeNull();
  });
});
