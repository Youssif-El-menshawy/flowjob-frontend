import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobsPage as JobsPageData, JobsQuery } from '@/shared/api/types';

const page = (over: Partial<JobsPageData> = {}): JobsPageData => ({
  items: [
    { id: 'j1', title: 'Software Intern', company: 'Bosch Group', city: 'Wrocław', location: 'Wrocław, Poland',
      level: 'internship', url: 'https://jobs.example/j1', postedAt: '2026-11-01T09:00:00Z', source: 'SmartRecruiters' },
    { id: 'j2', title: 'Junior Developer', company: 'Monterail', city: 'Poland', location: 'Remote, Poland',
      level: 'entry', url: null, postedAt: null, source: 'Workable' },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  levels: { internship: 1, entry: 1, other: 5 },
  cities: [{ name: 'Wrocław', count: 1 }, { name: 'Poland', count: 1 }],
  companies: [{ name: 'Bosch Group', count: 1 }, { name: 'Monterail', count: 1 }],
  refreshing: false,
  refreshedAt: '2026-11-09T10:00:00Z',
  ...over,
});

const mocks = vi.hoisted(() => ({
  queries: [] as JobsQuery[],
  result: { data: undefined as unknown, isLoading: false, isError: false, isFetching: false },
  fetchJob: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/shared/api/queries', () => ({
  useJobs: (q: JobsQuery) => {
    mocks.queries.push(q);
    return mocks.result;
  },
  fetchJob: mocks.fetchJob,
}));
vi.mock('@/shared/ui/Overlay', () => ({ useToast: () => mocks.toast }));
// Search is debounced in the app; make it immediate in tests.
vi.mock('@/shared/lib/hooks', () => ({ useDocumentTitle: () => {}, useDebouncedValue: <T,>(v: T) => v }));

import JobsPage from './JobsPage';

function MatchProbe() {
  const job = (useLocation().state as { job?: { title: string; description: string } } | null)?.job;
  return <div>MATCH PAGE {job?.title} | {job?.description}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/jobs']}>
      <Routes>
        <Route path="/app/jobs" element={<JobsPage />} />
        <Route path="/app/match" element={<MatchProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const lastQuery = () => mocks.queries[mocks.queries.length - 1];

afterEach(() => {
  cleanup();
  mocks.queries = [];
  mocks.result = { data: undefined, isLoading: false, isError: false, isFetching: false };
  mocks.fetchJob.mockReset();
  mocks.toast.mockReset();
});

describe('JobsPage', () => {
  it('starts on entry-level jobs and shows counts, badges and the source', () => {
    mocks.result.data = page();
    renderPage();
    expect(lastQuery()).toMatchObject({ level: 'entry', page: 1 });
    expect(screen.getByText(/2 for students and graduates · 7 in total/)).toBeInTheDocument();
    expect(screen.getByText('Internship')).toBeInTheDocument();
    expect(screen.getByText('Entry level')).toBeInTheDocument();
    expect(screen.getByText(/via SmartRecruiters/)).toBeInTheDocument();
    expect(screen.getByText(/Poland \(location not specified\)/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /View posting/ });
    expect(link).toHaveAttribute('href', 'https://jobs.example/j1');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('sends level, city, company and search to the API', () => {
    mocks.result.data = page();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Internships' }));
    expect(lastQuery().level).toBe('internship');
    fireEvent.change(screen.getByLabelText('Filter by city'), { target: { value: 'Wrocław' } });
    fireEvent.change(screen.getByLabelText('Filter by company'), { target: { value: 'Bosch Group' } });
    fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'intern' } });
    expect(lastQuery()).toMatchObject({ level: 'internship', city: 'Wrocław', company: 'Bosch Group', q: 'intern', page: 1 });
  });

  it('explains an empty level and offers all levels', () => {
    mocks.result.data = page({ items: [], total: 0 });
    renderPage();
    expect(screen.getByText('No jobs at this level right now')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all levels' }));
    expect(lastQuery().level).toBe('all');
  });

  it('shows progress while the server collects jobs for the first time', () => {
    mocks.result.data = page({ items: [], total: 0, levels: {}, refreshing: true, refreshedAt: null });
    renderPage();
    expect(screen.getAllByText(/Collecting open jobs/).length).toBeGreaterThan(0);
  });

  it('Match my CV opens the match form with the full job description', async () => {
    mocks.result.data = page();
    mocks.fetchJob.mockResolvedValue({ ...page().items[0], description: 'Learn robotics with us.' });
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Match my CV' })[0]);
    expect(await screen.findByText('MATCH PAGE Software Intern | Learn robotics with us.')).toBeInTheDocument();
    expect(mocks.fetchJob).toHaveBeenCalledWith('j1');
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('warns when a job board shares no description', async () => {
    mocks.result.data = page();
    mocks.fetchJob.mockResolvedValue({ ...page().items[1], description: null });
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Match my CV' })[1]);
    await screen.findByText(/MATCH PAGE Junior Developer/);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ text: expect.stringMatching(/Paste it from the posting/) }));
  });
});
