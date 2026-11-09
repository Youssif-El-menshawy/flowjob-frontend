import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { qk } from '@/shared/api/queries';
import type { MatchResult } from '@/shared/api/types';
import MatchReportPage from './MatchReportPage';
import { RecentMatches } from './RecentMatches';

const selected: MatchResult = {
  id: 'm1', cvId: 'cv1', cvName: 'Original', jobTitle: 'Product Analyst', company: 'Acme',
  jobText: '', score: 78, verdict: 'Good fit', summary: 'Sample', strengths: [], gaps: [], createdAt: '2026-02-01',
};
const other: MatchResult = { ...selected, id: 'm2', jobTitle: 'Quality Engineer', company: 'Example' };
const target = '/api/v1/matches/m1';
const action = () => screen.getByLabelText('Actions for Product Analyst · Acme');
const disclosure = () => action().closest('details')!;
const menuDelete = () => within(disclosure()).getByRole('button', { name: 'Delete match' });
const row = () => screen.queryByRole('link', { name: /Product Analyst · Acme/ });
const confirm = () => screen.getByRole('dialog', { name: 'Delete match?' });
const deleteButton = () => within(confirm()).getByRole('button', { name: 'Delete match' });

function RouteProbe() {
  return <output aria-label="Current page">{useLocation().pathname}</output>;
}

function setup({ fail = false, holdRefresh = false, single = false } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  let matches = single ? [selected] : [selected, other];
  let finishRefresh: () => void = () => {};
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === target && init?.method === 'DELETE') {
      if (fail) return Response.json({ detail: 'Unavailable' }, { status: 503 });
      matches = matches.filter((match) => match.id !== selected.id);
      return new Response(null, { status: 204 });
    }
    if (url === '/api/v1/matches') {
      if (holdRefresh) await new Promise<void>((resolve) => { finishRefresh = resolve; });
      return Response.json(matches);
    }
    if (url === target) {
      const found = matches.find((match) => match.id === selected.id);
      return found ? Response.json(found) : Response.json({ detail: 'Match not found' }, { status: 404 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  queryClient.setQueryData(qk.matches, matches);
  queryClient.setQueryData(qk.match(selected.id), selected);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/match']}>
        <RouteProbe />
        <Routes>
          <Route path="/app/match" element={<><RecentMatches /><Link to="/app/match/m1">Open report by URL</Link></>} />
          <Route path="/app/match/:matchId" element={<MatchReportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetcher, queryClient, finishRefresh: () => finishRefresh() };
}

function openConfirmation() {
  fireEvent.click(action());
  expect(disclosure()).toHaveAttribute('open');
  fireEvent.click(menuDelete());
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('opens and closes the row menu without navigating, while the report link still navigates', () => {
  const { fetcher } = setup();
  fireEvent.click(action());
  expect(disclosure()).toHaveAttribute('open');
  expect(screen.getByLabelText('Current page')).toHaveTextContent(/^\/app\/match$/);
  fireEvent.keyDown(menuDelete(), { key: 'Escape' });
  expect(disclosure()).not.toHaveAttribute('open');
  expect(action()).toHaveFocus();
  fireEvent.click(row()!);
  expect(screen.getByLabelText('Current page')).toHaveTextContent('/app/match/m1');
  expect(fetcher).not.toHaveBeenCalled();
});

it('shows the title and company in confirmation and keeps the row on Cancel', () => {
  const { fetcher } = setup();
  openConfirmation();
  expect(confirm()).toHaveTextContent('Product Analyst at Acme');
  fireEvent.click(within(confirm()).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(row()).toBeVisible();
  expect(action()).toHaveFocus();
  expect(fetcher).not.toHaveBeenCalled();
});

it('removes the selected row before list refetch completes and handles its old URL', async () => {
  const { fetcher, queryClient, finishRefresh } = setup({ holdRefresh: true });
  openConfirmation();
  fireEvent.click(deleteButton());

  await waitFor(() => {
    expect(row()).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  expect(screen.getByRole('link', { name: /Quality Engineer · Example/ })).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith(target, expect.objectContaining({ method: 'DELETE' }));
  expect(queryClient.getQueryData(qk.match(selected.id))).toBeUndefined();
  expect(fetcher).toHaveBeenCalledWith('/api/v1/matches', expect.anything());
  finishRefresh();
  await waitFor(() => expect(queryClient.isFetching({ queryKey: qk.matches })).toBe(0));

  fireEvent.click(screen.getByRole('link', { name: 'Open report by URL' }));
  expect(await screen.findByRole('heading', { name: 'Match report not found' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Back to Job Match' })).toHaveAttribute('href', '/app/match');
});

it('closes confirmation after deleting the only remaining report', async () => {
  setup({ single: true });
  openConfirmation();
  fireEvent.click(deleteButton());
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.queryByRole('heading', { name: 'Recent matches' })).not.toBeInTheDocument();
});

it('reports a failed delete without removing the match or its cached report', async () => {
  const { fetcher, queryClient } = setup({ fail: true });
  openConfirmation();
  fireEvent.click(deleteButton());
  expect(await within(confirm()).findByRole('alert')).toHaveTextContent('Could not delete this match');
  expect(row()).toBeInTheDocument();
  expect(queryClient.getQueryData(qk.match(selected.id))).toEqual(selected);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
