import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchResult } from '@/shared/api/types';
import { defaultTab, groupRequirements, pickTop } from './matchReport';

const mocks = vi.hoisted(() => ({
  match: { data: undefined as MatchResult | undefined, isLoading: false, isError: false, error: null as unknown, isFetching: false, refetch: vi.fn() },
  runMutate: vi.fn(),
  useMatchCalls: 0,
}));
vi.mock('@/shared/api/queries', () => ({
  useMatch: () => {
    mocks.useMatchCalls++;
    return mocks.match;
  },
  useRunMatch: () => ({ mutate: mocks.runMutate, isPending: false }),
}));

import MatchReportPage from './MatchReportPage';

const req = (requirement: string, importance: 'required' | 'preferred', status: string, evidence = `Evidence for ${requirement}`) => ({
  requirement, importance, status, evidence,
});
const base: MatchResult = {
  id: 'm1', cvId: 'cv1', cvName: 'Original CV', jobTitle: 'Backend Engineer', company: 'Acme', jobText: '', jobUrl: 'acme.com/j',
  score: 78, verdict: 'Good fit', summary: 's', strengths: [], gaps: [], createdAt: '2026-02-01T10:00:00Z', scoreAvailable: true,
  overallAssessment: 'Solid.', scoreExplanation: 'Scored 78/100.',
  matched: [
    req('Docs', 'preferred', 'clearly_demonstrated'), req('Python', 'required', 'clearly_demonstrated'),
    req('REST', 'required', 'clearly_demonstrated'), req('Git', 'preferred', 'clearly_demonstrated'), req('MongoDB', 'required', 'clearly_demonstrated'),
  ],
  partiallyMatched: [req('CI/CD', 'preferred', 'partially_demonstrated', 'Some pipelines.')],
  missing: [req('Docker', 'preferred', 'not_mentioned', 'Not mentioned in the CV.'), req('AWS', 'required', 'uncertain', 'No cloud evidence.')],
  recommendations: ['Lead with backend.'], questions: ['Used Docker?'],
};

function renderReport() {
  return render(
    <MemoryRouter initialEntries={['/app/match/m1']}>
      <Routes><Route path="/app/match/:matchId" element={<MatchReportPage />} /></Routes>
    </MemoryRouter>,
  );
}
const tab = (n: RegExp) => screen.getByRole('tab', { name: n });
const panel = () => screen.getByRole('tabpanel');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.match = { data: base, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  mocks.runMutate = vi.fn();
  mocks.useMatchCalls = 0;
});
mocks.match.data = base;

describe('pure selection helpers', () => {
  it('groups by saved assessment and defaults Unverified → Partial → Matched', () => {
    const g = groupRequirements(base);
    expect([g.matched.length, g.partial.length, g.unverified.length]).toEqual([5, 1, 2]);
    expect(defaultTab(g)).toBe('unverified');
    expect(defaultTab({ ...g, unverified: [] })).toBe('partial');
    expect(defaultTab({ ...g, unverified: [], partial: [] })).toBe('matched');
  });
  it('picks required first, then saved order, max 3, without mutating input', () => {
    const input = base.matched!;
    const names = pickTop(input).map((r) => r.requirement);
    expect(names).toEqual(['Python', 'REST', 'MongoDB']);
    expect(input[0].requirement).toBe('Docs');
    expect(pickTop([req('A', 'preferred', 'x'), req('B', 'preferred', 'x')]).map((r) => r.requirement)).toEqual(['A', 'B']);
  });
});

describe('overview and quick summary', () => {
  it('shows the saved score and real counts', () => {
    renderReport();
    expect(screen.getByRole('progressbar', { name: 'Match score' })).toHaveAttribute('aria-valuenow', '78');
    expect(screen.getByText('Good fit')).toBeInTheDocument();
    const stats = document.querySelector('dl')!;
    expect(within(stats as HTMLElement).getByText('Matched').previousElementSibling).toHaveTextContent('5');
    expect(within(stats as HTMLElement).getByText('Partial').previousElementSibling).toHaveTextContent('1');
    expect(within(stats as HTMLElement).getByText('Unverified').previousElementSibling).toHaveTextContent('2');
    expect(screen.getByText(/not an employer ATS score/i)).toBeInTheDocument();
  });

  it('lists up to three strongest matches, required first', () => {
    renderReport();
    const card = screen.getByRole('region', { name: 'Your strongest matches' });
    const items = within(card).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toHaveLength(3);
    expect(items[0]).toContain('Python');
    expect(items.join()).not.toContain('Docs');
  });

  it('lists areas to address (partial + unverified), required first, with non-accusing wording', () => {
    renderReport();
    const card = screen.getByRole('region', { name: 'Areas to address' });
    const items = within(card).getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('AWS'); // the only required one comes first
    expect(items.join()).toContain('Not shown in the CV');
    expect(within(card).getByText(/doesn’t demonstrate it — not that you lack the skill/i)).toBeInTheDocument();
    expect(items.join(' ')).not.toMatch(/lack|missing skill/i); // items never accuse the candidate
  });

  it('handles empty categories gracefully', () => {
    mocks.match.data = { ...base, matched: [], partiallyMatched: [], missing: [] };
    renderReport();
    expect(within(screen.getByRole('region', { name: 'Your strongest matches' })).getByText(/Nothing from this post/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Areas to address' })).getByText('Nothing obvious to address.')).toBeInTheDocument();
    expect(tab(/Matched \(0\)/)).toBeInTheDocument();
  });

  it('survives missing optional data', () => {
    mocks.match.data = { ...base, matched: undefined, partiallyMatched: undefined, missing: undefined, strengths: undefined as never, gaps: undefined as never, recommendations: undefined, questions: undefined, scoreExplanation: undefined, overallAssessment: undefined };
    expect(() => renderReport()).not.toThrow();
    expect(tab(/Unverified \(0\)/)).toBeInTheDocument();
  });
});

describe('tabs', () => {
  it('renders tablist/tab/tabpanel semantics with counts', () => {
    renderReport();
    expect(screen.getByRole('tablist', { name: 'Requirement categories' })).toBeInTheDocument();
    expect(tab(/Matched \(5\)/)).toBeInTheDocument();
    expect(tab(/Partial \(1\)/)).toBeInTheDocument();
    expect(tab(/Unverified \(2\)/)).toBeInTheDocument();
    expect(tab(/Unverified/)).toHaveAttribute('aria-controls', panel().id);
    expect(panel()).toHaveAttribute('aria-labelledby', tab(/Unverified/).id);
  });

  it('selects Unverified by default when populated', () => {
    renderReport();
    expect(tab(/Unverified/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/Unverified/)).toHaveAttribute('tabindex', '0');
    expect(tab(/Matched/)).toHaveAttribute('tabindex', '-1');
  });

  it('falls back to Partial, then Matched', () => {
    mocks.match.data = { ...base, missing: [] };
    renderReport();
    expect(tab(/Partial/)).toHaveAttribute('aria-selected', 'true');
    cleanup();
    mocks.match.data = { ...base, missing: [], partiallyMatched: [] };
    renderReport();
    expect(tab(/Matched/)).toHaveAttribute('aria-selected', 'true');
  });

  it('shows only the active tab’s requirements', () => {
    renderReport();
    expect(within(panel()).getByText('Docker')).toBeInTheDocument();
    expect(within(panel()).getByText('AWS')).toBeInTheDocument();
    expect(within(panel()).queryByText('Python')).toBeNull();
    fireEvent.click(tab(/Matched/));
    expect(within(panel()).getByText('Python')).toBeInTheDocument();
    expect(within(panel()).queryByText('Docker')).toBeNull();
    fireEvent.click(tab(/Partial/));
    expect(within(panel()).getByText('CI/CD')).toBeInTheDocument();
  });

  it('supports arrow / Home / End keyboard navigation', () => {
    renderReport();
    tab(/Unverified/).focus();
    fireEvent.keyDown(tab(/Unverified/), { key: 'ArrowRight' }); // wraps to Matched
    expect(tab(/Matched/)).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(tab(/Matched/));
    fireEvent.keyDown(tab(/Matched/), { key: 'ArrowRight' });
    expect(tab(/Partial/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab(/Partial/), { key: 'End' });
    expect(tab(/Unverified/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab(/Unverified/), { key: 'Home' });
    expect(tab(/Matched/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab(/Matched/), { key: 'ArrowLeft' });
    expect(tab(/Unverified/)).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the selected tab when the saved match is re-delivered (background refetch)', () => {
    const { rerender } = renderReport();
    fireEvent.click(tab(/Matched/));
    mocks.match.data = { ...base, missing: [], partiallyMatched: [] }; // new data object, different counts
    rerender(
      <MemoryRouter initialEntries={['/app/match/m1']}>
        <Routes><Route path="/app/match/:matchId" element={<MatchReportPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(tab(/Matched/)).toHaveAttribute('aria-selected', 'true');
  });

  it('makes no network request when switching tabs or toggling cards', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderReport();
    fireEvent.click(tab(/Matched/));
    fireEvent.click(within(panel()).getAllByRole('button')[0]);
    fireEvent.click(tab(/Partial/));
    fireEvent.click(screen.getByRole('button', { name: /View job details/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.runMutate).not.toHaveBeenCalled();
  });
});

describe('expandable requirement cards', () => {
  const rows = () => within(panel()).getAllByRole('button');

  it('start collapsed with title, badge, label and chevron; evidence hidden', () => {
    renderReport();
    const aws = within(panel()).getByRole('button', { name: /AWS/ });
    expect(aws).toHaveAttribute('aria-expanded', 'false');
    expect(aws).toHaveTextContent('Required');
    expect(aws).toHaveTextContent('Unverified');
    expect(aws.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('No cloud evidence.')).not.toBeVisible();
    expect(within(panel()).getByRole('button', { name: /Docker/ })).toHaveTextContent('Preferred');
  });

  it('expand/collapse individually and allow several open at once', () => {
    renderReport();
    const [first, second] = rows();
    fireEvent.click(first);
    fireEvent.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('No cloud evidence.')).toBeVisible();
    expect(screen.getByText('Not mentioned in the CV.')).toBeVisible();
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(first.getAttribute('aria-controls')).toBeTruthy();
  });

  it('keeps expanded cards open after switching tabs and back', () => {
    renderReport();
    fireEvent.click(rows()[0]);
    fireEvent.click(tab(/Matched/));
    fireEvent.click(tab(/Unverified/));
    expect(rows()[0]).toHaveAttribute('aria-expanded', 'true');
  });

  it('wraps very long names and evidence', () => {
    const long = 'x'.repeat(300);
    mocks.match.data = { ...base, missing: [req(long, 'required', 'not_mentioned', long)] };
    renderReport();
    fireEvent.click(rows()[0]);
    expect(screen.getAllByText(long)[0].className).toContain('break-words');
  });
});

describe('actions', () => {
  it('offers exactly one Tailor and one Add to Applications link, in the header, with the right targets', () => {
    renderReport();
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
    const tailor = within(header).getByRole('link', { name: 'Tailor my CV for this job' });
    const apps = within(header).getByRole('link', { name: 'Add to Applications' });
    expect(tailor).toHaveAttribute('href', '/app/match/m1/tailor');
    const q = new URLSearchParams(apps.getAttribute('href')!.split('?')[1]);
    expect([q.get('company'), q.get('jobTitle'), q.get('jobUrl'), q.get('cvId')]).toEqual(['Acme', 'Backend Engineer', 'acme.com/j', 'cv1']);
    expect(screen.getAllByRole('link', { name: 'Tailor my CV for this job' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Add to Applications' })).toHaveLength(1);
  });

  it('has no bottom "Next steps" section', () => {
    renderReport();
    expect(screen.queryByText('Next steps')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Start a new match' })).toBeNull();
    expect(screen.queryByText(/never adds skills you do not have/i)).toBeNull();
  });

  it('places the header actions before the requirement breakdown', () => {
    renderReport();
    const tailor = screen.getByRole('link', { name: 'Tailor my CV for this job' });
    expect(tailor.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps recommendations visible below the tabs', () => {
    renderReport();
    const recommendation = screen.getByText('Lead with backend.');
    expect(recommendation).toBeVisible();
    expect(screen.getByRole('tablist').compareDocumentPosition(recommendation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
