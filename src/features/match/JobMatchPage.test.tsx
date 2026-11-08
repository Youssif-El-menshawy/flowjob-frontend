import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
}));

vi.mock('@/shared/api/queries', () => ({
  useCvs: () => mocks.cvs,
  useMatches: () => mocks.matches,
  useRunMatch: () => mocks.run,
}));

import JobMatchPage from './JobMatchPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/match']}>
      <Routes>
        <Route path="/app/match" element={<JobMatchPage />} />
        <Route path="/app/match/:matchId" element={<div>REPORT PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const fill = () => {
  fireEvent.change(screen.getByPlaceholderText('Backend Engineer'), { target: { value: 'Backend Engineer' } });
  fireEvent.change(screen.getByPlaceholderText(/Paste the full job post/i), {
    target: { value: 'A long enough job description with requirements.' },
  });
};
const analyse = () => screen.getByRole('button', { name: /Analyse job match|Analysing/i });

afterEach(() => {
  cleanup();
  mocks.cvs = { data: [{ id: 'cv1', name: 'My CV', kind: 'original', updatedAt: '2026-01-01' }], isLoading: false };
  mocks.matches = { data: [] };
  mocks.run = { mutate: vi.fn(), isPending: false };
});

describe('JobMatchPage (input step)', () => {
  it('renders the input form with CV, title, company, URL and description', () => {
    renderPage();
    expect(screen.getByLabelText('CV to compare')).toBeInTheDocument();
    expect(screen.getByLabelText('Job title')).toBeInTheDocument();
    expect(screen.getByLabelText(/Company/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Job URL/)).toBeInTheDocument();
    expect(screen.getByLabelText('Job description')).toBeInTheDocument();
    expect(analyse()).toBeInTheDocument();
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

  it('keeps Analyse disabled until the required fields are filled, then submits once', () => {
    renderPage();
    expect(analyse()).toBeDisabled();
    fill();
    expect(analyse()).toBeEnabled();
    fireEvent.click(analyse());
    expect(mocks.run.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.run.mutate.mock.calls[0][0]).toMatchObject({
      cvId: 'cv1',
      jobTitle: 'Backend Engineer',
      jobDescription: 'A long enough job description with requirements.',
    });
  });

  it('navigates to /app/match/:id after a successful analysis', () => {
    mocks.run.mutate = vi.fn((_vars, opts) => opts.onSuccess({ id: 'm9' }));
    renderPage();
    fill();
    fireEvent.click(analyse());
    expect(screen.getByText('REPORT PAGE')).toBeInTheDocument();
  });

  it('shows progress and blocks duplicate submissions while analysing', () => {
    mocks.run.isPending = true;
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent(/Reading the job post/i);
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
});
