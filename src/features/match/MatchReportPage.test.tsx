import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  tailor: { mutate: vi.fn(), isPending: false, isError: false, error: null as unknown },
  runMutate: vi.fn(), // must NEVER be called by the report page
}));

vi.mock('@/shared/api/queries', () => ({
  useMatch: (id?: string) => {
    mocks.useMatchArg = id;
    return mocks.match;
  },
  useTailor: () => mocks.tailor,
  useRunMatch: () => ({ mutate: mocks.runMutate, isPending: false }),
}));

import MatchReportPage from './MatchReportPage';

const LONG =
  'Built and operated production REST services handling millions of requests per day across several regions, ' +
  'including on-call rotations, incident reviews, capacity planning and a long-running migration of a monolith. '.repeat(4);

const req = (requirement: string, importance: 'required' | 'preferred', status: string, evidence: string) => ({
  requirement, importance, status, evidence,
});

const base: MatchResult = {
  id: 'm1', cvId: 'cv1', cvName: 'Original CV', jobTitle: 'Backend Engineer', company: 'Acme',
  jobText: '', jobUrl: 'acme.com/jobs/1', score: 78, verdict: 'Good fit', summary: 'Legacy summary.',
  strengths: [], gaps: [], createdAt: '2026-02-01T10:00:00Z',
  scoreAvailable: true,
  overallAssessment: 'Your CV shows solid hands-on backend work. The biggest gap is Docker, which isn’t clear from your CV.',
  scoreExplanation: 'Scored 78/100 across 5 requirements.',
  matched: [
    req('Python', 'required', 'clearly_demonstrated', LONG),
    req('REST APIs', 'required', 'clearly_demonstrated', 'Your CV lists designing REST services.'),
  ],
  partiallyMatched: [req('CI/CD', 'preferred', 'partially_demonstrated', 'Your CV mentions some pipelines.')],
  missing: [req('Docker', 'required', 'not_mentioned', 'Not shown in your CV.')],
  recommendations: ['Lead your summary with backend work.', 'Quantify one API project.'],
  questions: ['Used Docker?'],
  suggestedWording: [{ section: 'summary', suggestion: 'Backend engineer with Python and MongoDB.' }],
};

const historical: MatchResult = {
  ...base,
  overallAssessment: 'The candidate has strong Python experience but lacks Docker.',
  summary: 'The candidate has strong Python experience but lacks Docker.',
};

function renderReport(id = 'm1') {
  return render(
    <MemoryRouter initialEntries={[`/app/match/${id}`]}>
      <Routes>
        <Route path="/app/match/:matchId" element={<MatchReportPage />} />
        <Route path="/app/tailor/d1" element={<div>Tailoring draft d1</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
const section = (name: string) => screen.getByRole('region', { name });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.match = { data: base, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  mocks.runMutate = vi.fn();
  mocks.tailor = { mutate: vi.fn(), isPending: false, isError: false, error: null };
});
mocks.match.data = base;

describe('overview', () => {
  it('shows job title, company, CV used, percentage, verdict and a score bar', () => {
    renderReport();
    expect(mocks.useMatchArg).toBe('m1');
    expect(screen.getByRole('heading', { level: 1, name: 'Backend Engineer' })).toBeInTheDocument();
    expect(screen.getByText('Acme · CV used: Original CV')).toBeInTheDocument();
    expect(screen.getByText('Good fit')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Match score' })).toHaveAttribute('aria-valuenow', '78');
  });

  it('shows the saved personal explanation and compact Matched / Partial / Not shown counts', () => {
    renderReport();
    expect(screen.getByText(/Your CV shows solid hands-on backend work/)).toBeInTheDocument();
    const counts = within(section('Match overview')).getByText('Matched').closest('dl')!;
    expect(within(counts).getByText('Matched').previousElementSibling).toHaveTextContent('2');
    expect(within(counts).getByText('Partial').previousElementSibling).toHaveTextContent('1');
    expect(within(counts).getByText('Not shown').previousElementSibling).toHaveTextContent('1');
  });

  it('always shows the heuristic disclaimer (not hidden behind a disclosure)', () => {
    renderReport();
    const disclaimer = screen.getByText(/not an employer ATS score or a hiring prediction/i);
    expect(disclaimer).toBeVisible();
    expect(disclaimer.closest('[hidden]')).toBeNull();
  });

  it('moves technical scoring into a collapsed, accessible "About this score" disclosure', () => {
    renderReport();
    const btn = screen.getByRole('button', { name: 'About this score' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls');
    expect(screen.getByText('Scored 78/100 across 5 requirements.')).not.toBeVisible();
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: 'Hide score details' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Scored 78/100 across 5 requirements.')).toBeVisible();
  });

  it('shows "Score unavailable" and no bar when no score exists', () => {
    mocks.match.data = { ...base, scoreAvailable: false, verdict: 'Not enough information' };
    renderReport();
    expect(screen.getByText('Score unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('says plainly that no requirements were found, never "Nice work"', () => {
    mocks.match.data = {
      ...base, scoreAvailable: false, verdict: 'Not enough information',
      matched: [], partiallyMatched: [], missing: [], qualificationCounts: undefined,
    };
    renderReport();
    expect(screen.getByText(/couldn’t find any clear requirements in this post/)).toBeInTheDocument();
    expect(screen.queryByText(/Nice work/)).toBeNull();
    expect(screen.queryByText(/Scored qualifications/)).toBeNull();
    expect(screen.queryByText('Not shown')).toBeNull();
  });
});

describe('historical reports', () => {
  it('shows a generated personal summary, never "the candidate", and keeps the original text under About this score', () => {
    mocks.match.data = historical;
    renderReport();
    const overview = section('Match overview');
    expect(within(overview).getByText(/Your CV clearly shows Python and REST APIs/)).toBeVisible();
    expect(within(overview).getByText(/The biggest gap to address is Docker/)).toBeVisible();
    expect(screen.getByText('The candidate has strong Python experience but lacks Docker.')).not.toBeVisible(); // only inside the closed disclosure
    fireEvent.click(screen.getByRole('button', { name: 'About this score' }));
    expect(screen.getByText('Original assessment')).toBeVisible();
    expect(screen.getByText('The candidate has strong Python experience but lacks Docker.')).toBeVisible();
  });

  it('renders old reports that lack the newer fields without crashing', () => {
    mocks.match.data = {
      ...base, matched: undefined, partiallyMatched: undefined, missing: undefined, recommendations: undefined,
      suggestedWording: undefined, questions: undefined, scoreExplanation: undefined, overallAssessment: undefined,
      strengths: [{ skill: 'Python', evidence: 'Used Python' }], gaps: [{ skill: 'Docker', tip: 'Add it' }],
    };
    expect(() => renderReport()).not.toThrow();
    expect(within(section('How your CV compares')).getByText('Python')).toBeInTheDocument();
  });

  it('copes with an empty report', () => {
    mocks.match.data = { ...base, matched: [], partiallyMatched: [], missing: [], recommendations: [], overallAssessment: '', summary: '' };
    expect(() => renderReport()).not.toThrow();
    expect(screen.getByText(/No specific changes stand out/)).toBeInTheDocument();
  });
});

describe('How your CV compares', () => {
  it('shows "What matches" and "What needs attention" with CV evidence, required first', () => {
    renderReport();
    const cmp = section('How your CV compares');
    expect(within(cmp).getByRole('heading', { name: 'What matches' })).toBeInTheDocument();
    expect(within(cmp).getByRole('heading', { name: 'What needs attention' })).toBeInTheDocument();
    const lists = within(cmp).getAllByRole('list');
    const attention = within(lists[1]).getAllByRole('listitem').map((li) => li.textContent);
    expect(attention[0]).toContain('Docker'); // the only required gap first
    expect(attention[0]).toContain('Not shown in your CV');
    expect(attention[1]).toContain('CI/CD');
    expect(attention[1]).toContain('Your CV mentions some pipelines.'); // evidence shown
    expect(within(lists[0]).getByText('Your CV lists designing REST services.')).toBeInTheDocument();
  });

  it('truncates long evidence and never uses the old section names or accusing wording', () => {
    renderReport();
    const cmp = section('How your CV compares');
    const python = within(cmp).getAllByRole('listitem')[0];
    expect(python.textContent!.length).toBeLessThan(260);
    expect(python.textContent).toContain('…');
    expect(screen.queryByText('Your strongest matches')).toBeNull();
    expect(screen.queryByText('Areas to address')).toBeNull();
    const listText = within(cmp).getAllByRole('list').map((l) => l.textContent).join(' ');
    expect(listText).not.toMatch(/\black|\bmissing skill|candidate/i); // findings never accuse; only the reassurance note says "lack"
    expect(within(cmp).getByText(/doesn’t demonstrate it — not that you lack the skill/)).toBeInTheDocument();
  });

  it('has graceful empty states', () => {
    mocks.match.data = { ...base, matched: [], partiallyMatched: [] };
    renderReport();
    expect(within(section('How your CV compares')).getByText(/Nothing from this post is clearly shown/)).toBeInTheDocument();
  });

  it('says "Nice work" only when everything is shown', () => {
    mocks.match.data = { ...base, partiallyMatched: [], missing: [] };
    renderReport();
    expect(
      within(section('How your CV compares')).getByText(/Every qualification this post lists is shown in your CV/),
    ).toBeInTheDocument();
  });
});

describe('Improve your CV for this job', () => {
  it('lists up to three saved improvements and drops the standalone old sections', () => {
    mocks.match.data = { ...base, recommendations: ['One', 'Two', 'Three', 'Four'] };
    renderReport();
    const imp = section('Improve your CV for this job');
    expect(within(imp).getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)).toEqual(['One', 'Two', 'Three']);
    expect(screen.queryByRole('heading', { name: 'How to improve your CV for this job' })).toBeNull();
    expect(screen.queryByText(/Stronger wording/i)).toBeNull();
    expect(screen.queryByText('Backend engineer with Python and MongoDB.')).toBeNull();
  });

  it('derives improvements from partly shown requirements when there are no recommendations', () => {
    mocks.match.data = { ...base, recommendations: [] };
    renderReport();
    const imp = section('Improve your CV for this job');
    expect(within(imp).getByText('Make CI/CD clearer in your CV.')).toBeInTheDocument();
    expect(within(imp).getByText(/Your CV says: Your CV mentions some pipelines\./)).toBeInTheDocument();
  });

  it('does not invent improvements when the analysis cannot support any', () => {
    mocks.match.data = { ...base, recommendations: [], partiallyMatched: [] };
    renderReport();
    const imp = section('Improve your CV for this job');
    expect(within(imp).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(imp).getByText(/No specific changes stand out/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tailor my CV' })).toBeEnabled(); // tailoring is still offered
  });

  it('has exactly one primary Tailor action and one secondary Add to Applications link, in the header', () => {
    renderReport();
    const tailorBtn = screen.getByRole('button', { name: 'Tailor my CV' });
    const apps = screen.getByRole('link', { name: 'Add to Applications' });
    expect(screen.getAllByRole('button', { name: 'Tailor my CV' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Add to Applications' })).toHaveLength(1);
    // Both actions live in the page header, next to the job title.
    expect(tailorBtn.closest('header')).not.toBeNull();
    expect(apps.closest('header')).not.toBeNull();
    const q = new URLSearchParams(apps.getAttribute('href')!.split('?')[1]);
    expect([q.get('company'), q.get('jobTitle'), q.get('jobUrl'), q.get('cvId')]).toEqual(['Acme', 'Backend Engineer', 'acme.com/jobs/1', 'cv1']);
    expect(apps.getAttribute('href')).not.toContain('tailor'); // does not require tailoring
  });

  it('starts tailoring only on click, once, and opens the resulting draft', () => {
    mocks.tailor.mutate.mockImplementation((_, { onSuccess }) => onSuccess({ id: 'd1' }));
    renderReport();
    expect(mocks.tailor.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tailor my CV' }));
    expect(mocks.tailor.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.tailor.mutate).toHaveBeenCalledWith({ matchId: 'm1' }, expect.anything());
    expect(screen.getByText('Tailoring draft d1')).toBeVisible();
    expect(mocks.runMutate).not.toHaveBeenCalled();
  });

  it('shows a loading state that blocks repeat clicks, and surfaces tailoring errors', () => {
    mocks.tailor.isPending = true;
    renderReport();
    const btn = screen.getByRole('button', { name: /Tailor my CV/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mocks.tailor.mutate).not.toHaveBeenCalled();
    cleanup();
    mocks.tailor = { mutate: vi.fn(), isPending: false, isError: true, error: new ApiError(429, { message: 'Daily CV tailoring limit reached.' }) };
    renderReport();
    expect(screen.getByRole('alert')).toHaveTextContent('Daily CV tailoring limit reached.');
  });

  it('reassures that nothing is saved without review', () => {
    renderReport();
    expect(screen.getByText(/You review every suggestion before anything is saved/)).toBeInTheDocument();
  });
});

describe('page behaviour', () => {
  it('never starts AI work or any request when the page loads or sections are toggled', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderReport();
    fireEvent.click(screen.getByRole('button', { name: 'About this score' }));
    fireEvent.click(screen.getByRole('button', { name: /Detailed analysis/ }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.runMutate).not.toHaveBeenCalled();
    expect(mocks.tailor.mutate).not.toHaveBeenCalled();
  });

  it('does not render any job-input fields', () => {
    renderReport();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Analyse/i })).toBeNull();
    expect(screen.queryByText('Next steps')).toBeNull();
  });

  it('has an accessible heading outline and a concise default view', () => {
    renderReport();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual(['Match overview', 'How your CV compares', 'Improve your CV for this job', 'Detailed analysis']);
    expect(screen.getByRole('button', { name: /Detailed analysis/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('stacks its action buttons full-width on narrow screens', () => {
    renderReport();
    expect(screen.getByRole('button', { name: 'Tailor my CV' }).className).toContain('w-full');
    expect(screen.getByRole('link', { name: 'Add to Applications' }).className).toContain('w-full');
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
