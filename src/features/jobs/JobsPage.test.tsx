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

const CVS = [
  { id: 'cv-tailored', name: 'Tailored CV', kind: 'tailored' },
  { id: 'cv1', name: 'My CV', kind: 'original' },
];

const mocks = vi.hoisted(() => ({
  queries: [] as JobsQuery[],
  result: { data: undefined as unknown, isLoading: false, isError: false, isFetching: false },
  cvs: { data: [] as unknown[], isLoading: false },
  fetchJob: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/shared/api/queries', () => ({
  useJobs: (q: JobsQuery) => {
    mocks.queries.push(q);
    return mocks.result;
  },
  useCvs: () => mocks.cvs,
  fetchJob: mocks.fetchJob,
}));
vi.mock('@/shared/ui/Overlay', () => ({ useToast: () => mocks.toast }));
// Search is debounced in the app; make it immediate in tests.
vi.mock('@/shared/lib/hooks', () => ({ useDocumentTitle: () => {}, useDebouncedValue: <T,>(v: T) => v }));

import JobsPage from './JobsPage';

function MatchProbe() {
  const job = (useLocation().state as { job?: { title: string; description: string; cvId?: string } } | null)?.job;
  return (
    <div>
      MATCH PAGE {job?.title} | {job?.description} | cv={job?.cvId ?? 'none'}
    </div>
  );
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
  mocks.cvs = { data: [], isLoading: false };
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
    expect(await screen.findByText('MATCH PAGE Software Intern | Learn robotics with us. | cv=none')).toBeInTheDocument();
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

  describe('skill fit with a CV', () => {
    const withFit = () =>
      page({
        items: [
          { ...page().items[0], fit: { score: 75, label: 'Strong fit', matched: ['Python', 'SQL', 'Docker', 'Git', 'Linux', 'React'],
            missing: ['AWS'], missingOptional: ['Kubernetes'], missingLanguages: ['German'] } },
          { ...page().items[1], fit: { score: null, label: 'Not enough detail', matched: [], missing: [],
            missingOptional: [], missingLanguages: [] } },
        ],
      });

    it('compares with the original CV and sorts by best match by default', () => {
      mocks.cvs = { data: CVS, isLoading: false };
      mocks.result.data = withFit();
      renderPage();
      expect(lastQuery()).toMatchObject({ cvId: 'cv1', sort: 'fit' });
      expect(screen.getByLabelText('CV to compare with')).toHaveValue('cv1');
      fireEvent.change(screen.getByLabelText('Sort jobs'), { target: { value: 'recent' } });
      expect(lastQuery()).toMatchObject({ cvId: 'cv1', sort: 'recent', page: 1 });
      fireEvent.change(screen.getByLabelText('CV to compare with'), { target: { value: 'cv-tailored' } });
      expect(lastQuery().cvId).toBe('cv-tailored');
    });

    it('shows the fit, matched and missing skills, and a missing language', () => {
      mocks.cvs = { data: CVS, isLoading: false };
      mocks.result.data = withFit();
      renderPage();
      expect(screen.getByText('Strong fit · 75%')).toBeInTheDocument();
      expect(screen.getByText('You have: Python, SQL, Docker, Git, Linux +1 more')).toBeInTheDocument();
      expect(screen.getByText('Missing: AWS')).toBeInTheDocument();
      expect(screen.getByText('Nice to have: Kubernetes')).toBeInTheDocument();
      expect(screen.getByText(/Asks for German, which is not on your CV/)).toBeInTheDocument();
      expect(screen.getByText(/too few skills for a score/)).toBeInTheDocument();
    });

    it('without a CV it lists newest first and invites the user to create one', () => {
      mocks.result.data = page();
      renderPage();
      expect(lastQuery()).toMatchObject({ sort: 'recent' });
      expect(lastQuery().cvId).toBeUndefined();
      expect(screen.getByRole('link', { name: 'Create a CV' })).toHaveAttribute('href', '/app/cv-builder');
      expect(screen.queryByLabelText('Sort jobs')).not.toBeInTheDocument();
    });

    it('passes the chosen CV on to Job Match', async () => {
      mocks.cvs = { data: CVS, isLoading: false };
      mocks.result.data = withFit();
      mocks.fetchJob.mockResolvedValue({ ...page().items[0], description: 'Learn robotics with us.' });
      renderPage();
      fireEvent.change(screen.getByLabelText('CV to compare with'), { target: { value: 'cv-tailored' } });
      fireEvent.click(screen.getAllByRole('button', { name: 'Match my CV' })[0]);
      expect(await screen.findByText(/cv=cv-tailored/)).toBeInTheDocument();
    });
  });
});
