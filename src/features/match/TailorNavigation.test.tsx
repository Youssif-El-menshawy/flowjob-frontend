import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { qk } from '@/shared/api/queries';
import type { Cv, MatchResult, TailorDirectInput, TailorDraft, TailorMatchInput } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';
import JobMatchPage from './JobMatchPage';
import MatchReportPage from './MatchReportPage';
import TailorPage from './TailorPage';

vi.mock('@/features/cv/HarvardPdfViewer', () => ({ HarvardPdfViewer: () => null }));

const cv: Cv = {
  id: 'cv1', name: 'Original CV', kind: 'original', contentRevision: 'revision-1', createdAt: '', updatedAt: '',
  content: {
    fullName: 'Fixture User', email: 'fixture@example.test', phone: '', location: '', links: [],
    summary: 'Built REST APIs', experience: [], education: [], projects: [], skills: [], languages: '',
  },
};
const report: MatchResult = {
  id: 'm1', cvId: cv.id, cvName: cv.name, jobTitle: 'Backend Engineer', company: 'Acme',
  jobText: '', score: 78, verdict: 'Good fit', summary: 'Fixture assessment', strengths: [], gaps: [],
  createdAt: '2026-01-01',
};
const matchDraft: TailorDraft = {
  id: 'match-draft', matchId: 'm1', sourceCvId: cv.id, sourceCvRevision: cv.contentRevision,
  jobTitle: report.jobTitle, company: 'Acme',
  suggestions: [
    { id: 's1', section: 'summary', original: cv.content.summary, suggested: 'Built REST APIs.', reviewRequired: false },
  ],
};
const directDraft: TailorDraft = { ...matchDraft, id: 'direct-draft', matchId: undefined, company: 'Direct Co' };
const JOB = 'A backend engineering role building Python APIs and supporting operational reliability for a small team.';

type Input = TailorDirectInput | TailorMatchInput;
type Fixtures = {
  getDraft?: (id: string) => Response | Promise<Response>;
  generate?: (input: Input) => Response | Promise<Response>;
  getCvs?: () => Response | Promise<Response>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

const unavailable = () => Response.json({ detail: 'Please try again later.' }, { status: 503 });

function mockBackend(fixtures: Fixtures = {}) {
  const requests: { path: string; method: string; input?: Input; signal?: AbortSignal | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url, 'http://fixture.test').pathname.replace(/^\/api\/v1/, '');
    const method = init.method ?? 'GET';
    const request = { path, method, signal: init.signal };
    if (path === '/tailor' && method === 'POST') {
      const input = JSON.parse(String(init.body)) as Input;
      requests.push({ ...request, input });
      return fixtures.generate?.(input) ?? Response.json('matchId' in input ? matchDraft : directDraft);
    }
    requests.push(request);
    if (path === '/cvs') return fixtures.getCvs?.() ?? Response.json([cv]);
    if (path === '/cvs/cv1') return Response.json(cv);
    if (path === '/cvs/preview/pdf') return new Response('%PDF-fixture', { headers: { 'Content-Type': 'application/pdf' } });
    if (path === '/matches' && method === 'GET') return Response.json([]);
    if (path === '/matches/m1') return Response.json(report);
    if (path === '/tailor/capabilities') return Response.json({ sourceVerification: 1 });
    if (path.startsWith('/tailor/') && method === 'GET') {
      const id = path.slice('/tailor/'.length);
      return fixtures.getDraft?.(id) ?? Response.json(id === directDraft.id ? directDraft : matchDraft);
    }
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  }));
  return {
    generations: () => requests.filter((request) => request.method === 'POST' && request.path === '/tailor'),
    matchGenerations: () => requests.filter((request) => request.method === 'POST' && request.path === '/matches'),
    reads: (id: string) => requests.filter((request) => request.method === 'GET' && request.path === `/tailor/${id}`),
  };
}

function renderAt(entries: string[], initialIndex?: number, queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: 2 } },
})) {
  const router = createMemoryRouter([
    { path: '/app/match', element: <JobMatchPage /> },
    { path: '/app/match/:matchId', element: <MatchReportPage /> },
    { path: '/app/match/:matchId/tailor', element: <TailorPage /> },
    { path: '/app/tailor/:draftId', element: <TailorPage /> },
  ], { initialEntries: entries, initialIndex });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider><RouterProvider router={router} /></ToastProvider>
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

const showDraft = (company: string) => screen.findByRole('heading', { name: `Tailor your CV for ${company}` });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('generates once from a match report and reopens the same draft through Back, Forward and reload', async () => {
  const generated = deferred<Response>();
  const backend = mockBackend({ generate: () => generated.promise });
  const { router } = renderAt(['/app/match/m1']);
  const tailor = await screen.findByRole('button', { name: 'Tailor my CV' });
  expect(backend.generations()).toHaveLength(0);

  act(() => { tailor.click(); tailor.click(); });
  await waitFor(() => expect(backend.generations()).toHaveLength(1));
  expect(backend.generations()[0].input).toEqual({ matchId: 'm1' });
  await waitFor(() => expect(tailor).toBeDisabled());
  generated.resolve(Response.json(matchDraft));
  await showDraft('Acme');
  expect(router.state.location.pathname).toBe('/app/tailor/match-draft');

  await act(() => router.navigate(-1));
  expect(await screen.findByRole('button', { name: 'Tailor my CV' })).toBeVisible();
  await act(() => router.navigate(1));
  await showDraft('Acme');
  expect(backend.reads(matchDraft.id)).toHaveLength(2);

  cleanup();
  renderAt(['/app/tailor/match-draft']);
  await showDraft('Acme');
  expect(backend.reads(matchDraft.id)).toHaveLength(3);
  expect(backend.generations()).toHaveLength(1);
  expect(backend.matchGenerations()).toHaveLength(0);
});

it('submits direct tailoring once and locks the matching button against a same-tick click', async () => {
  const generated = deferred<Response>();
  const backend = mockBackend({ generate: () => generated.promise });
  const { router } = renderAt(['/app/match']);
  const tailor = await screen.findByRole('button', { name: 'Tailor my CV' });
  const match = screen.getByRole('button', { name: 'Check my match' });
  fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Backend Engineer' } });
  fireEvent.change(screen.getByLabelText('Job description'), { target: { value: JOB } });
  expect(backend.generations()).toHaveLength(0);

  act(() => { tailor.click(); tailor.click(); match.click(); });
  await waitFor(() => expect(backend.generations()).toHaveLength(1));
  expect(backend.matchGenerations()).toHaveLength(0);
  expect(backend.generations()[0].input).toEqual({ cvId: cv.id, jobTitle: 'Backend Engineer', jobDescription: JOB });
  generated.resolve(Response.json(directDraft));
  await showDraft('Direct Co');
  expect(router.state.location.pathname).toBe('/app/tailor/direct-draft');
  await act(() => router.navigate(-1));
  expect(await screen.findByRole('button', { name: 'Tailor my CV' })).toBeVisible();
  await act(() => router.navigate(1));
  await showDraft('Direct Co');
  expect(backend.generations()).toHaveLength(1);
  expect(backend.reads(directDraft.id)).toHaveLength(2);
});

it('keeps a new direct recovery entry when an earlier submission finishes', async () => {
  const generated = deferred<Response>();
  const backend = mockBackend({ generate: () => generated.promise });
  const { router, queryClient } = renderAt(['/app/match']);
  const tailor = await screen.findByRole('button', { name: 'Tailor my CV' });
  fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Backend Engineer' } });
  fireEvent.change(screen.getByLabelText('Job description'), { target: { value: JOB } });
  fireEvent.click(tailor);
  await waitFor(() => expect(backend.generations()).toHaveLength(1));

  await act(() => router.navigate('/app/match', { state: { freshTailoringDraft: {
    sourceCvId: cv.id, jobTitle: 'New recovery role', company: 'Recovery Co',
  } } }));
  expect(screen.getByLabelText('Job title')).toHaveValue('New recovery role');
  expect(screen.getByLabelText('Job description')).toHaveValue('');
  generated.resolve(Response.json(directDraft));
  await waitFor(() => expect(queryClient.getQueryData(qk.tailorDraft(directDraft.id))).toEqual(directDraft));
  expect(router.state.location.pathname).toBe('/app/match');
  expect(screen.getByRole('button', { name: 'Tailor my CV' })).toBeDisabled();
  expect(backend.generations()).toHaveLength(1);
});

it('cancels an obsolete draft read on parameter change and never generates', async () => {
  const oldRead = deferred<Response>();
  const backend = mockBackend({ getDraft: (id) => id === matchDraft.id ? oldRead.promise : Response.json(directDraft) });
  const { router } = renderAt(['/app/tailor/match-draft']);
  expect(await screen.findByText('Loading your saved draft…')).toBeVisible();
  await waitFor(() => expect(backend.reads(matchDraft.id)).toHaveLength(1));

  await act(() => router.navigate('/app/tailor/direct-draft'));
  await showDraft('Direct Co');
  expect(backend.reads(matchDraft.id)[0].signal?.aborted).toBe(true);
  await act(async () => oldRead.resolve(Response.json(matchDraft)));
  expect(screen.queryByRole('heading', { name: 'Tailor your CV for Acme' })).not.toBeInTheDocument();
  expect(backend.generations()).toHaveLength(0);
});

it('does not let an old match generation redirect a newer match URL', async () => {
  const generated = deferred<Response>();
  const second = { ...matchDraft, id: 'second-draft', matchId: 'm2', company: 'Second Co' };
  const backend = mockBackend({
    generate: (input) => 'matchId' in input && input.matchId === 'm1' ? generated.promise : Response.json(second),
    getDraft: () => Response.json(second),
  });
  const { router, queryClient } = renderAt(['/app/match/m1/tailor']);
  const start = screen.getByRole('button', { name: 'Start tailoring' });
  expect(backend.generations()).toHaveLength(0);
  act(() => { start.click(); start.click(); });
  await waitFor(() => expect(backend.generations()).toHaveLength(1));

  await act(() => router.navigate('/app/match/m2/tailor'));
  expect(screen.getByRole('button', { name: 'Start tailoring' })).toBeEnabled();
  generated.resolve(Response.json(matchDraft));
  await waitFor(() => expect(queryClient.getQueryData(qk.tailorDraft(matchDraft.id))).toEqual(matchDraft));
  expect(router.state.location.pathname).toBe('/app/match/m2/tailor');
  expect(backend.generations()).toHaveLength(1);

  fireEvent.click(screen.getByRole('button', { name: 'Start tailoring' }));
  await showDraft('Second Co');
  expect(backend.generations().map(({ input }) => input)).toEqual([{ matchId: 'm1' }, { matchId: 'm2' }]);
  expect(router.state.location.pathname).toBe('/app/tailor/second-draft');
});

it('separates a failed read from an empty verified draft and retries with GET only', async () => {
  let fail = true;
  const backend = mockBackend({
    getDraft: () => fail ? unavailable() : Response.json({ ...directDraft, suggestions: [] }),
  });
  renderAt(['/app/tailor/direct-draft']);
  expect(await screen.findByText('Could not load this draft')).toBeVisible();
  expect(screen.queryByText('No meaningful improvements found.')).not.toBeInTheDocument();
  expect(backend.reads(directDraft.id)).toHaveLength(1);

  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No meaningful improvements found.')).toBeVisible();
  expect(backend.reads(directDraft.id)).toHaveLength(2);
  expect(backend.generations()).toHaveLength(0);
});

it.each([404, 410])('rechecks a cached draft and safely handles a %s response', async (status) => {
  const backend = mockBackend({ getDraft: () => Response.json({ detail: 'Draft unavailable.' }, { status }) });
  const qc = new QueryClient();
  qc.setQueryData(qk.tailorDraft(directDraft.id), directDraft);
  renderAt(['/app/tailor/direct-draft'], undefined, qc);
  expect(await screen.findByText('Draft not found')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Save as new CV' })).not.toBeInTheDocument();
  expect(backend.reads(directDraft.id)).toHaveLength(1);
  expect(backend.generations()).toHaveLength(0);
});

it('requires an explicit retry after a failed generation from the old match URL', async () => {
  let fail = true;
  const backend = mockBackend({ generate: () => fail ? unavailable() : Response.json(matchDraft) });
  renderAt(['/app/match/m1/tailor']);
  fireEvent.click(screen.getByRole('button', { name: 'Start tailoring' }));
  expect(await screen.findByText('Could not tailor this CV')).toBeVisible();
  expect(backend.generations()).toHaveLength(1);

  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry tailoring' }));
  await showDraft('Acme');
  expect(backend.generations()).toHaveLength(2);
});

it('shows a CV-list error on the job form instead of claiming the user has no CVs', async () => {
  let fail = true;
  const backend = mockBackend({ getCvs: () => fail ? unavailable() : Response.json([cv]) });
  renderAt(['/app/match']);
  expect(await screen.findByText('Could not load your CVs')).toBeVisible();
  expect(screen.queryByText('Create your CV first')).not.toBeInTheDocument();

  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Tailor my CV' })).toBeDisabled();
  expect(backend.generations()).toHaveLength(0);
});
