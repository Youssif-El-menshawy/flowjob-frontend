import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchResult } from '@/shared/api/types';

const mocks = vi.hoisted(() => ({
  cvs: { data: [{ id: 'cv1', name: 'My CV', kind: 'original', updatedAt: '2026-01-01' }], isLoading: false },
  match: { data: undefined as MatchResult | undefined, isLoading: false },
  matches: { data: [] as MatchResult[] },
  run: { mutate: vi.fn(), isPending: false },
}));

vi.mock('@/shared/api/queries', () => ({
  useCvs: () => mocks.cvs,
  useMatch: () => mocks.match,
  useMatches: () => mocks.matches,
  useRunMatch: () => mocks.run,
}));

import JobMatchPage from './JobMatchPage';

function renderPage(path = '/app/match') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/match" element={<JobMatchPage />} />
        <Route path="/app/match/:matchId" element={<JobMatchPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const result: MatchResult = {
  id: 'm1', cvId: 'cv1', cvName: 'My CV', jobTitle: 'Backend Engineer', company: 'Acme',
  jobText: '', score: 80, verdict: 'Strong fit', summary: 'Good alignment.', strengths: [], gaps: [],
  createdAt: '2026-02-01', scoreAvailable: true, overallAssessment: 'Good alignment.',
  scoreExplanation: 'Scored 80/100.', matched: [{ requirement: 'Python', importance: 'required', evidence: 'Built APIs' }],
  partiallyMatched: [], missing: [{ requirement: 'Docker', importance: 'preferred', evidence: 'Not mentioned in the CV' }],
  recommendations: ['Mention containers'], questions: ['Used Docker?'], model: 'gpt-4o-mini', analysisVersion: '1',
};

afterEach(() => {
  cleanup();
  mocks.match.data = undefined;
  mocks.run.isPending = false;
  mocks.run.mutate = vi.fn();
});

describe('JobMatchPage', () => {
  it('shows the CV select and the analyse form', () => {
    renderPage();
    expect(screen.getByText('CV to compare')).toBeTruthy();
    expect(screen.getByText('Job title')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Analyse job/i })).toBeTruthy();
  });

  it('disables Analyse until a job title and description are entered (repeat-click protection)', () => {
    renderPage();
    const btn = screen.getByRole('button', { name: /Analyse job/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true); // empty form
    fireEvent.change(screen.getByPlaceholderText('Backend Engineer'), { target: { value: 'Dev' } });
    fireEvent.change(screen.getByPlaceholderText(/Paste the full job post/i), { target: { value: 'A long enough job description here.' } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(mocks.run.mutate).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state and a disabled button while analysing', () => {
    mocks.run.isPending = true;
    renderPage();
    expect(screen.getByText(/Reading the job post/i)).toBeTruthy();
    const btn = screen.getByRole('button', { name: /Analysing/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('renders the structured result when viewing an existing match', () => {
    mocks.match.data = result;
    renderPage('/app/match/m1');
    expect(screen.getByText('Strong fit')).toBeTruthy(); // score number is animated; verdict is stable
    expect(screen.getByText('Clearly matched')).toBeTruthy();
    expect(screen.getByText('Missing or unverified')).toBeTruthy();
    expect(screen.getByText('Python')).toBeTruthy();
    expect(screen.getByText(/How to improve your CV/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Add to Applications/i })).toBeTruthy();
  });

  it('shows "Score unavailable" when the model lacked enough information', () => {
    mocks.match.data = { ...result, scoreAvailable: false, verdict: 'Not enough information' };
    renderPage('/app/match/m1');
    expect(screen.getByText(/Score unavailable/i)).toBeTruthy();
  });
});
