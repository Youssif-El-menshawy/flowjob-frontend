import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/client';
import type { MatchResult } from '@/shared/api/types';

const mocks = vi.hoisted(() => ({
  match: {
    data: undefined as MatchResult | undefined,
    isLoading: false,
    isError: false,
    error: null as unknown,
    isFetching: false,
    refetch: vi.fn(),
  },
  useMatchArg: undefined as string | undefined,
  runMutate: vi.fn(), // must NEVER be called by the report page
}));

vi.mock('@/shared/api/queries', () => ({
  useMatch: (id?: string) => {
    mocks.useMatchArg = id;
    return mocks.match;
  },
  useRunMatch: () => ({ mutate: mocks.runMutate, isPending: false }),
}));

import MatchReportPage from './MatchReportPage';

const LONG =
  'Built and operated production REST services handling millions of requests per day across several regions, ' +
  'including on-call rotations, incident reviews, capacity planning and a long-running migration of a monolith. '.repeat(4);

const base: MatchResult = {
  id: 'm1', cvId: 'cv1', cvName: 'Original CV', jobTitle: 'Backend Engineer', company: 'Acme',
  jobText: '', jobUrl: 'acme.com/jobs/1', score: 78, verdict: 'Good fit', summary: 'Legacy summary.',
  strengths: [], gaps: [], createdAt: '2026-02-01T10:00:00Z',
  scoreAvailable: true, overallAssessment: 'Solid hands-on backend work.', scoreExplanation: 'Scored 78/100.',
  matched: [{ requirement: 'Python', importance: 'required', status: 'clearly_demonstrated', evidence: LONG }],
  partiallyMatched: [{ requirement: 'CI/CD', importance: 'preferred', status: 'partially_demonstrated', evidence: 'Some pipelines.' }],
  missing: [{ requirement: 'Docker', importance: 'preferred', status: 'not_mentioned', evidence: 'Not mentioned in the CV.' }],
  recommendations: ['Lead with backend.', 'Quantify one project.'], questions: ['Used Docker?'],
  suggestedWording: [{ section: 'summary', suggestion: 'Backend engineer with Python and MongoDB.' }],
};

function renderReport(id = 'm1') {
  return render(
    <MemoryRouter initialEntries={[`/app/match/${id}`]}>
      <Routes>
        <Route path="/app/match/:matchId" element={<MatchReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  mocks.match = { data: base, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  mocks.runMutate = vi.fn();
});
mocks.match.data = base;

describe('MatchReportPage', () => {
  it('loads the saved report by id from the URL and never starts an analysis', () => {
    renderReport('m1');
    expect(mocks.useMatchArg).toBe('m1');
    expect(mocks.runMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Backend Engineer' })).toBeInTheDocument();
  });

  it('shows job header, company, CV used, verdict, score bar and explanation', () => {
    renderReport();
    expect(screen.getByText('Acme · CV used: Original CV')).toBeInTheDocument();
    expect(screen.getByText('Good fit')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Match score' })).toHaveAttribute('aria-valuenow', '78');
    expect(screen.getByText('Solid hands-on backend work.')).toBeInTheDocument();
    expect(screen.getByText('Scored 78/100.')).toBeInTheDocument();
    expect(screen.getByText(/not an employer ATS score/i)).toBeInTheDocument();
  });

  it('does not render any job-input fields', () => {
    renderReport();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByLabelText(/Job description/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Analyse/i })).toBeNull();
  });

  it('shows recommendations, stronger wording and clarifying questions', () => {
    renderReport();
    expect(screen.getByText('Lead with backend.')).toBeInTheDocument();
    expect(screen.getByText('Quantify one project.')).toBeInTheDocument();
    expect(screen.getByText('Backend engineer with Python and MongoDB.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A few things to confirm' })).toBeInTheDocument();
    expect(screen.getByText('Used Docker?')).toBeInTheDocument();
  });

  it('shows "Score unavailable" and hides the progress bar when no score exists', () => {
    mocks.match.data = { ...base, scoreAvailable: false, verdict: 'Not enough information' };
    renderReport();
    expect(screen.getByText('Score unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  describe('job details disclosure', () => {
    it('is collapsed by default and opens/closes with the keyboard-operable button', () => {
      renderReport();
      const btn = screen.getByRole('button', { name: /View job details/i });
      expect(btn).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByText('Job URL')).not.toBeVisible();
      fireEvent.click(btn);
      expect(screen.getByRole('button', { name: /Hide job details/i })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Job URL')).toBeVisible();
      expect(screen.getByRole('link', { name: 'acme.com/jobs/1' })).toHaveAttribute('href', 'https://acme.com/jobs/1');
      fireEvent.click(screen.getByRole('button', { name: /Hide job details/i }));
      expect(screen.getByText('Job URL')).not.toBeVisible();
    });

    it('says the description is not stored instead of inventing one', () => {
      renderReport();
      fireEvent.click(screen.getByRole('button', { name: /View job details/i }));
      expect(screen.getByText(/full job description is not stored/i)).toBeVisible();
    });

    it('shows the full description only when it is actually available', () => {
      mocks.match.data = { ...base, jobText: 'We need a Python engineer.\nSecond line.' };
      renderReport();
      fireEvent.click(screen.getByRole('button', { name: /View job details/i }));
      expect(screen.getByText(/We need a Python engineer/)).toBeVisible();
      expect(screen.queryByText(/not stored/i)).toBeNull();
    });

    it('copes with missing company, URL and CV metadata', () => {
      mocks.match.data = { ...base, company: '', jobUrl: undefined, cvName: '' };
      renderReport();
      fireEvent.click(screen.getByRole('button', { name: /View job details/i }));
      expect(screen.getByText('Not available')).toBeVisible(); // CV used fallback
      expect(screen.queryByText('Job URL')).toBeNull();
    });

    it('never turns a javascript: URL into a clickable javascript link', () => {
      mocks.match.data = { ...base, jobUrl: 'javascript:alert(1)//x.com' };
      renderReport();
      fireEvent.click(screen.getByRole('button', { name: /View job details/i }));
      expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    });
  });

  describe('actions', () => {
    it('offers a way to start a new match', () => {
      renderReport();
      expect(screen.getByRole('link', { name: 'Start a new match' })).toHaveAttribute('href', '/app/match');
    });
  });

  describe('loading and error states', () => {
    it('shows an accessible loading status', () => {
      mocks.match = { ...mocks.match, data: undefined, isLoading: true };
      renderReport();
      expect(screen.getByRole('status')).toHaveTextContent(/Loading your match report/i);
    });

    it('shows "not found" for a missing/deleted/invalid id (404)', () => {
      mocks.match = { ...mocks.match, data: undefined, isError: true, error: new ApiError(404, { message: 'Match not found' }) };
      renderReport('does-not-exist');
      expect(screen.getByText('Match report not found')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to Job Match' })).toHaveAttribute('href', '/app/match');
    });

    it('shows an access message on authorization failures', () => {
      mocks.match = { ...mocks.match, data: undefined, isError: true, error: new ApiError(401, { message: 'x' }) };
      renderReport();
      expect(screen.getByText(/can’t open this report/i)).toBeInTheDocument();
    });

    it('offers a retry after a network failure', () => {
      const refetch = vi.fn();
      mocks.match = { ...mocks.match, data: undefined, isError: true, error: new TypeError('Failed to fetch'), refetch };
      renderReport();
      expect(screen.getByText('Could not load this report')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });
});
