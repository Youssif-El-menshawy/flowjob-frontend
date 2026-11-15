import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/client';
import type { MatchResult } from '@/shared/api/types';

const mocks = vi.hoisted(() => ({
  cvs: {
    data: [{ id: 'cv1', name: 'My CV', kind: 'original', updatedAt: '2026-01-01' }] as unknown[] | undefined,
    isLoading: false,
  },
  matches: { data: [] as MatchResult[] },
  run: { mutate: vi.fn(), isPending: false },
  tailor: { mutate: vi.fn(), isPending: false },
}));

vi.mock('@/shared/api/queries', () => ({
  useCvs: () => mocks.cvs,
  useMatches: () => mocks.matches,
  useRunMatch: () => mocks.run,
  useTailorDirect: () => mocks.tailor,
}));

import JobMatchPage from './JobMatchPage';

function LocationProbe() {
  return <div>DRAFT PAGE {useParams().draftId}</div>;
}

function renderPage(entry: string | { pathname: string; state: unknown } = '/app/match') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/match" element={<JobMatchPage />} />
        <Route path="/app/match/:matchId" element={<div>REPORT PAGE</div>} />
        <Route path="/app/tailor/:draftId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const JOB =
  'We are hiring a backend engineer to build Python and REST APIs on MongoDB. Requirements: three years of experience.';
const fill = () => {
  fireEvent.change(screen.getByPlaceholderText('Backend Engineer'), { target: { value: 'Backend Engineer' } });
  fireEvent.change(screen.getByPlaceholderText(/Paste the full job post/i), {
    target: { value: JOB },
  });
};
const analyse = () => screen.getByRole('button', { name: /Check my match|Checking match/i });
const tailorBtn = () => screen.getByRole('button', { name: /Tailor my CV|Tailoring/i });

afterEach(() => {
  cleanup();
  mocks.cvs = { data: [{ id: 'cv1', name: 'My CV', kind: 'original', updatedAt: '2026-01-01' }], isLoading: false };
  mocks.matches = { data: [] };
  mocks.run = { mutate: vi.fn(), isPending: false };
  mocks.tailor = { mutate: vi.fn(), isPending: false };
});

describe('JobMatchPage (input step)', () => {
  it('renders the input form with CV, title, company, URL and description', () => {
    renderPage();
    expect(screen.getByLabelText('CV to use')).toBeInTheDocument();
    expect(screen.getByLabelText('Job title')).toBeInTheDocument();
    expect(screen.getByLabelText(/Company/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Job URL/)).toBeInTheDocument();
    expect(screen.getByLabelText('Job description')).toBeInTheDocument();
    expect(analyse()).toBeInTheDocument();
    expect(tailorBtn()).toBeInTheDocument();
  });

  it('shows no analysis results on the input page', () => {
    renderPage();
    expect(screen.queryByText('Clearly matched')).toBeNull();
    expect(screen.queryByText('Job match report')).toBeNull();
  });

  it('never starts an analysis while typing', () => {
    renderPage();
    fill();
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'more text typed here' } });
    expect(mocks.run.mutate).not.toHaveBeenCalled();
  });

  it('keeps Check my match disabled until the required fields are filled, then submits once', () => {
    renderPage();
    expect(analyse()).toBeDisabled();
    fill();
    expect(analyse()).toBeEnabled();
    fireEvent.click(analyse());
    expect(mocks.run.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.run.mutate.mock.calls[0][0]).toMatchObject({
      cvId: 'cv1',
      jobTitle: 'Backend Engineer',
      jobDescription: JOB,
    });
    expect(mocks.tailor.mutate).not.toHaveBeenCalled(); // matching never calls tailoring
  });

  it('navigates to /app/match/:id after a successful analysis', () => {
    mocks.run.mutate = vi.fn((_vars, opts) => opts.onSuccess({ id: 'm9' }));
    renderPage();
    fill();
    fireEvent.click(analyse());
    expect(screen.getByText('REPORT PAGE')).toBeInTheDocument();
  });

  it('shows one spinner in the Check my match button and blocks duplicate submissions while analysing', () => {
    mocks.run.isPending = true;
    const { container } = renderPage();
    expect(analyse()).toHaveTextContent('Checking match…');
    expect(screen.getByRole('status')).toHaveTextContent('Checking match…'); // announced, visually hidden
    expect(screen.getByRole('status')).toHaveClass('sr-only');
    expect(container.querySelectorAll('.animate-spin')).toHaveLength(1);
    expect(analyse().querySelector('.animate-spin')).not.toBeNull();
    expect(tailorBtn()).toHaveTextContent('Tailor my CV'); // disabled, no spinner, label unchanged
    expect(tailorBtn()).toBeDisabled();
    expect(screen.queryByText(/Reading the job post|Comparing it with your CV|Writing your feedback/)).toBeNull();
    expect(analyse()).toBeDisabled();
    expect(screen.getByLabelText('Job title')).toBeDisabled(); // whole form locked via fieldset
    fireEvent.click(analyse());
    expect(mocks.run.mutate).not.toHaveBeenCalled();
  });

  it('shows quota/provider errors as an alert, and validation errors by the field', () => {
    mocks.run.mutate = vi.fn((_vars, opts) =>
      opts.onError(new ApiError(429, { message: 'Daily AI match limit reached. Please try again tomorrow.' })),
    );
    renderPage();
    fill();
    fireEvent.click(analyse());
    expect(screen.getByRole('alert')).toHaveTextContent('Daily AI match limit reached');

    cleanup();
    mocks.run.mutate = vi.fn((_vars, opts) =>
      opts.onError(new ApiError(422, { message: 'Paste a bit more of the job post so we can compare it.' })),
    );
    renderPage();
    fill();
    fireEvent.click(analyse());
    expect(screen.getByText(/Paste a bit more of the job post/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lets the user retry after an error', () => {
    mocks.run.mutate = vi.fn((_vars, opts) => opts.onError(new ApiError(502, { message: 'AI unavailable' })));
    renderPage();
    fill();
    fireEvent.click(analyse());
    fireEvent.click(analyse());
    expect(mocks.run.mutate).toHaveBeenCalledTimes(2);
  });

  it('lists recent matches that link to their saved reports', () => {
    mocks.matches = {
      data: [
        { id: 'm1', jobTitle: 'Backend Engineer', company: 'Acme', score: 78, createdAt: '2026-02-01' } as MatchResult,
        { id: 'm2', jobTitle: 'Designer', company: '', score: 0, scoreAvailable: false, createdAt: '2026-02-02' } as MatchResult,
      ],
    };
    renderPage();
    expect(screen.getByRole('link', { name: /Backend Engineer · Acme/ })).toHaveAttribute('href', '/app/match/m1');
    expect(screen.getByRole('link', { name: /Designer/ })).toHaveAttribute('href', '/app/match/m2');
    expect(screen.getByText('78%')).toBeInTheDocument();
  });

  it('asks the user to create a CV first when none exist', () => {
    mocks.cvs = { data: [], isLoading: false };
    renderPage();
    expect(screen.getByText('Create your CV first')).toBeInTheDocument();
    expect(screen.queryByLabelText('Job title')).toBeNull();
  });

  it('shows the heading and both actions without explanatory copy', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Match or tailor your CV' })).toBeInTheDocument();
    expect(analyse()).toBeInTheDocument();
    expect(tailorBtn()).toBeInTheDocument();
    expect(screen.queryByText(/See how your CV fits the role/)).not.toBeInTheDocument();
    expect(screen.queryByText(/without running a match analysis/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Only runs when you click one of the buttons above/)).not.toBeInTheDocument();
  });
});

describe('JobMatchPage direct tailoring', () => {
  it('blocks BOTH actions until CV, title and a long-enough description are provided', () => {
    renderPage();
    expect(analyse()).toBeDisabled();
    expect(tailorBtn()).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Backend Engineer'), { target: { value: 'Backend Engineer' } });
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'too short' } });
    expect(analyse()).toBeDisabled();
    expect(tailorBtn()).toBeDisabled();
    expect(screen.getByText(/at least 80 characters/i)).toBeInTheDocument();
    fireEvent.click(tailorBtn());
    expect(mocks.tailor.mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: JOB } });
    expect(analyse()).toBeEnabled();
    expect(tailorBtn()).toBeEnabled();
  });

  it('sends the selected CV and job data to the tailoring request — and never to matching', () => {
    renderPage();
    fill();
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: ' Acme ' } });
    fireEvent.change(screen.getByLabelText(/Job URL/), { target: { value: 'acme.com/jobs/1' } });
    fireEvent.click(tailorBtn());
    expect(mocks.tailor.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.tailor.mutate.mock.calls[0][0]).toEqual({
      cvId: 'cv1',
      jobTitle: 'Backend Engineer',
      jobDescription: JOB,
      company: 'Acme',
      jobUrl: 'acme.com/jobs/1',
    });
    expect(mocks.run.mutate).not.toHaveBeenCalled();
  });

  it('navigates to the direct draft route on success', () => {
    mocks.tailor.mutate = vi.fn((_v, opts) => opts.onSuccess({ id: 'd7' }));
    renderPage();
    fill();
    fireEvent.click(tailorBtn());
    expect(screen.getByText('DRAFT PAGE d7')).toBeInTheDocument();
  });

  it('shows which action is running, locks both buttons and blocks duplicate requests', () => {
    mocks.tailor.isPending = true;
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Tailoring…');
    expect(tailorBtn()).toHaveTextContent('Tailoring…');
    expect(analyse()).toHaveTextContent('Check my match');
    expect(analyse().querySelector('.animate-spin')).toBeNull();
    expect(tailorBtn()).toBeDisabled();
    expect(analyse()).toBeDisabled();
    fireEvent.click(tailorBtn());
    fireEvent.click(analyse());
    expect(mocks.tailor.mutate).not.toHaveBeenCalled();
    expect(mocks.run.mutate).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'Daily CV tailoring limit reached. Please try again tomorrow.'],
    [503, 'The AI service is at capacity today. Please try again tomorrow.'],
    [502, 'The AI service is unavailable. Please try again.'],
    [504, 'The AI service took too long to respond. Please try again.'],
  ])('shows a clear alert for a %s tailoring error', (status, message) => {
    mocks.tailor.mutate = vi.fn((_v, opts) => opts.onError(new ApiError(status, { message })));
    renderPage();
    fill();
    fireEvent.click(tailorBtn());
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('shows a friendly message for a network failure and lets the user retry', () => {
    mocks.tailor.mutate = vi.fn((_v, opts) => opts.onError(new TypeError('Failed to fetch')));
    renderPage();
    fill();
    fireEvent.click(tailorBtn());
    expect(screen.getByRole('alert')).toHaveTextContent(/check your connection/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent('Failed to fetch');
    fireEvent.click(tailorBtn());
    expect(mocks.tailor.mutate).toHaveBeenCalledTimes(2);
  });

  it('shows an invalid-CV 422 as an alert', () => {
    mocks.tailor.mutate = vi.fn((_v, opts) =>
      opts.onError(new ApiError(422, { message: 'This CV has no content to tailor yet.' })),
    );
    renderPage();
    fill();
    fireEvent.click(tailorBtn());
    expect(screen.getByRole('alert')).toHaveTextContent('no content to tailor');
  });

  it('never starts tailoring while typing', () => {
    renderPage();
    fill();
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: JOB + ' more' } });
    expect(mocks.tailor.mutate).not.toHaveBeenCalled();
  });
});


it('prefills a direct recovery and requests a fresh draft only on submit', () => {
  renderPage({
    pathname: '/app/match',
    state: {
      freshTailoringDraft: {
        sourceCvId: 'cv1', jobTitle: 'Product Quality Analyst', company: 'Example Analytics',
        jobUrl: 'example.com/jobs/1',
      },
    },
  });
  expect(screen.getByLabelText('CV to use')).toHaveValue('cv1');
  expect(screen.getByLabelText('Job title')).toHaveValue('Product Quality Analyst');
  expect(screen.getByLabelText(/Company/)).toHaveValue('Example Analytics');
  expect(screen.getByLabelText(/Job URL/)).toHaveValue('example.com/jobs/1');
  expect(screen.getByLabelText('Job description')).toHaveValue('');
  expect(tailorBtn()).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Job description'), { target: { value: JOB } });
  expect(mocks.tailor.mutate).not.toHaveBeenCalled();
  fireEvent.click(tailorBtn());
  expect(mocks.tailor.mutate).toHaveBeenCalledWith({
    cvId: 'cv1', jobTitle: 'Product Quality Analyst', company: 'Example Analytics',
    jobDescription: JOB, jobUrl: 'example.com/jobs/1', fresh: true,
  }, expect.anything());
});
