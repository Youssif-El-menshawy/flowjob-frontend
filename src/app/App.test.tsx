import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
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
  }),
}));
vi.mock('@/shared/api/queries', () => ({
  useApplications: () => ({ data: [] }),
  useCvs: () => ({ data: [{ id: 'cv1', name: 'My CV', kind: 'original', updatedAt: '2026-01-01' }], isLoading: false }),
  useMatches: () => ({ data: [] }),
  useMatch: (id?: string) => {
    mocks.matchIds.push(id);
    return { data: match, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  },
  useRunMatch: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/auth/LoginPage', () => ({ default: () => <div>LOGIN PAGE</div> }));
vi.mock('@/features/match/TailorPage', () => ({ default: () => <div>TAILOR PAGE</div> }));

import { App } from './App';
import { ToastProvider } from '@/shared/ui/Overlay';

function BackButton() {
  const nav = useNavigate();
  return <button onClick={() => nav(-1)}>browser back</button>;
}

function renderApp(entries: string[], index?: number) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <ToastProvider>
        <App />
        <BackButton />
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  mocks.status = 'authenticated';
  mocks.matchIds = [];
});

describe('Job Match route structure', () => {
  it('renders the input page inside the normal layout, with the sidebar', async () => {
    renderApp(['/app/match']);
    expect(await screen.findByRole('button', { name: /Analyse job match/i })).toBeInTheDocument();
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
    renderApp(['/app/match', '/app/match/m1'], 1);
    await screen.findByRole('heading', { level: 1, name: 'Backend Engineer' });
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }));
    expect(await screen.findByRole('button', { name: /Analyse job match/i })).toBeInTheDocument();

    cleanup();
    renderApp(['/app/match/m1']);
    fireEvent.click(await screen.findByRole('link', { name: /Back to Job Match/i }));
    expect(await screen.findByRole('button', { name: /Analyse job match/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument(); // sidebar is back
  });

  it('keeps /app/match/:id/tailor in the normal layout (not captured by the report route)', async () => {
    renderApp(['/app/match/m1/tailor']);
    expect(await screen.findByText('TAILOR PAGE')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
