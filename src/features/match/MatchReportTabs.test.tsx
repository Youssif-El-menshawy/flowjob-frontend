import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchResult } from '@/shared/api/types';

const mocks = vi.hoisted(() => ({
  match: { data: undefined as MatchResult | undefined, isLoading: false, isError: false, error: null as unknown, isFetching: false, refetch: vi.fn() },
  runMutate: vi.fn(),
}));
vi.mock('@/shared/api/queries', () => ({
  useMatch: () => mocks.match,
  useTailor: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useRunMatch: () => ({ mutate: mocks.runMutate, isPending: false }),
}));

import MatchReportPage from './MatchReportPage';

const req = (requirement: string, importance: 'required' | 'preferred', status: string, evidence = `Evidence for ${requirement}`) => ({
  requirement, importance, status, evidence,
});
const base: MatchResult = {
  id: 'm1', cvId: 'cv1', cvName: 'Original CV', jobTitle: 'Backend Engineer', company: 'Acme', jobText: '', jobUrl: 'acme.com/j',
  score: 78, verdict: 'Good fit', summary: 's', strengths: [], gaps: [], createdAt: '2026-02-01T10:00:00Z', scoreAvailable: true,
  overallAssessment: 'Your CV shows solid work.', scoreExplanation: 'Scored 78/100.',
  matched: [
    req('Docs', 'preferred', 'clearly_demonstrated'), req('Python', 'required', 'clearly_demonstrated'),
    req('REST', 'required', 'clearly_demonstrated'), req('Git', 'preferred', 'clearly_demonstrated'), req('MongoDB', 'required', 'clearly_demonstrated'),
  ],
  partiallyMatched: [req('CI/CD', 'preferred', 'partially_demonstrated', 'Some pipelines.')],
  missing: [req('Docker', 'preferred', 'not_mentioned', 'Not mentioned in the CV.'), req('AWS', 'required', 'uncertain', 'No cloud evidence.')],
  recommendations: ['Lead with backend.'],
};

function renderReport() {
  return render(
    <MemoryRouter initialEntries={['/app/match/m1']}>
      <Routes><Route path="/app/match/:matchId" element={<MatchReportPage />} /></Routes>
    </MemoryRouter>,
  );
}
const detailBtn = () => screen.getByRole('button', { name: /Detailed analysis/ });
const openDetail = () => fireEvent.click(detailBtn());
const tab = (n: RegExp) => screen.getByRole('tab', { name: n, hidden: true });
const panel = () => screen.getByRole('tabpanel', { hidden: true });
const renderOpen = () => {
  const r = renderReport();
  openDetail();
  return r;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.match = { data: base, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  mocks.runMutate = vi.fn();
});
mocks.match.data = base;

describe('Detailed analysis disclosure', () => {
  it('is collapsed by default, with its tabs and job details hidden', () => {
    renderReport();
    expect(detailBtn()).toHaveAttribute('aria-expanded', 'false');
    expect(detailBtn()).toHaveAttribute('aria-controls');
    expect(screen.getByRole('tablist', { hidden: true })).not.toBeVisible();
    expect(screen.getByText('Job details')).not.toBeVisible();
  });

  it('expands to show the requirement breakdown and the original job details', () => {
    renderReport();
    openDetail();
    expect(detailBtn()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tablist')).toBeVisible();
    expect(screen.getByText('Job details')).toBeVisible();
    expect(screen.getByRole('link', { name: 'acme.com/j' })).toHaveAttribute('href', 'https://acme.com/j');
    expect(screen.getByText(/full job description is not stored/i)).toBeVisible();
  });

  it('shows the stored job description only when it exists, and never a javascript: link', () => {
    mocks.match.data = { ...base, jobText: 'We need a Python engineer.', jobUrl: 'javascript:alert(1)//x.com' };
    renderOpen();
    expect(screen.getByText(/We need a Python engineer/)).toBeVisible();
    expect(screen.queryByText(/not stored/i)).toBeNull();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('copes with missing company, URL and CV metadata', () => {
    mocks.match.data = { ...base, company: '', jobUrl: undefined, cvName: '' };
    renderOpen();
    expect(screen.getByText('Not available')).toBeVisible();
    expect(screen.queryByText('Job URL')).toBeNull();
  });

  it('keeps the selected tab and open cards when it is collapsed and re-opened', () => {
    renderOpen();
    fireEvent.click(tab(/Matched/));
    fireEvent.click(within(panel()).getAllByRole('button')[0]);
    openDetail(); // collapse
    expect(detailBtn()).toHaveAttribute('aria-expanded', 'false');
    openDetail(); // re-open
    expect(tab(/Matched/)).toHaveAttribute('aria-selected', 'true');
    expect(within(panel()).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'true');
  });

  it('makes no request when opening, switching tabs or toggling cards', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderOpen();
    fireEvent.click(tab(/Matched/));
    fireEvent.click(within(panel()).getAllByRole('button')[0]);
    fireEvent.click(tab(/Partial/));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.runMutate).not.toHaveBeenCalled();
  });
});

describe('tabs', () => {
  it('renders tablist/tab/tabpanel semantics with counts and the Not shown label', () => {
    renderOpen();
    expect(screen.getByRole('tablist', { name: 'Requirement categories' })).toBeInTheDocument();
    expect(tab(/Matched \(5\)/)).toBeInTheDocument();
    expect(tab(/Partial \(1\)/)).toBeInTheDocument();
    expect(tab(/Not shown \(2\)/)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Unverified/ })).toBeNull();
    expect(tab(/Not shown/)).toHaveAttribute('aria-controls', panel().id);
    expect(panel()).toHaveAttribute('aria-labelledby', tab(/Not shown/).id);
  });

  it('selects Not shown by default when there are such requirements', () => {
    renderOpen();
    expect(tab(/Not shown/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/Not shown/)).toHaveAttribute('tabindex', '0');
    expect(tab(/Matched/)).toHaveAttribute('tabindex', '-1');
  });

  it('falls back to Partial, then Matched', () => {
    mocks.match.data = { ...base, missing: [] };
    renderOpen();
    expect(tab(/Partial/)).toHaveAttribute('aria-selected', 'true');
    cleanup();
    mocks.match.data = { ...base, missing: [], partiallyMatched: [] };
    renderOpen();
    expect(tab(/Matched/)).toHaveAttribute('aria-selected', 'true');
  });

  it('shows only the active tab’s requirements with their CV evidence', () => {
    renderOpen();
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
    renderOpen();
    tab(/Not shown/).focus();
    fireEvent.keyDown(tab(/Not shown/), { key: 'ArrowRight' });
    expect(tab(/Matched/)).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(tab(/Matched/));
    fireEvent.keyDown(tab(/Matched/), { key: 'ArrowRight' });
    expect(tab(/Partial/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab(/Partial/), { key: 'End' });
    expect(tab(/Not shown/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab(/Not shown/), { key: 'Home' });
    expect(tab(/Matched/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab(/Matched/), { key: 'ArrowLeft' });
    expect(tab(/Not shown/)).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the selected tab when the saved match is re-delivered (background refetch)', () => {
    const { rerender } = renderOpen();
    fireEvent.click(tab(/Matched/));
    mocks.match.data = { ...base, missing: [], partiallyMatched: [] };
    rerender(
      <MemoryRouter initialEntries={['/app/match/m1']}>
        <Routes><Route path="/app/match/:matchId" element={<MatchReportPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(tab(/Matched/)).toHaveAttribute('aria-selected', 'true');
  });

  it('shows friendly empty text and survives missing optional data', () => {
    mocks.match.data = { ...base, matched: [], partiallyMatched: [], missing: [] };
    renderOpen();
    expect(tab(/Matched \(0\)/)).toBeInTheDocument();
    expect(within(panel()).getByText(/Nothing from this post shows clearly/)).toBeInTheDocument();
    cleanup();
    mocks.match.data = { ...base, matched: undefined, partiallyMatched: undefined, missing: undefined, strengths: undefined as never, gaps: undefined as never };
    expect(() => renderReport()).not.toThrow();
  });
});

describe('expandable requirement cards', () => {
  const rows = () => within(panel()).getAllByRole('button');

  it('start collapsed with title, badge, label and chevron; evidence hidden', () => {
    renderOpen();
    const aws = within(panel()).getByRole('button', { name: /AWS/ });
    expect(aws).toHaveAttribute('aria-expanded', 'false');
    expect(aws).toHaveTextContent('Required');
    expect(aws).toHaveTextContent('Unverified'); // the saved per-requirement status label is unchanged
    expect(aws.querySelector('svg')).not.toBeNull();
    expect(within(panel()).getByText('No cloud evidence.')).not.toBeVisible();
    expect(within(panel()).getByRole('button', { name: /Docker/ })).toHaveTextContent('Preferred');
  });

  it('expand/collapse individually and allow several open at once', () => {
    renderOpen();
    const [first, second] = rows();
    fireEvent.click(first);
    fireEvent.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel()).getByText('No cloud evidence.')).toBeVisible();
    expect(within(panel()).getByText('Not mentioned in the CV.')).toBeVisible();
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(first.getAttribute('aria-controls')).toBeTruthy();
  });

  it('keeps expanded cards open after switching tabs and back', () => {
    renderOpen();
    fireEvent.click(rows()[0]);
    fireEvent.click(tab(/Matched/));
    fireEvent.click(tab(/Not shown/));
    expect(rows()[0]).toHaveAttribute('aria-expanded', 'true');
  });

  it('wraps very long names and evidence', () => {
    const long = 'x'.repeat(300);
    mocks.match.data = { ...base, missing: [req(long, 'required', 'not_mentioned', long)] };
    renderOpen();
    fireEvent.click(rows()[0]);
    expect(screen.getAllByText(long)[0].className).toContain('break-words');
  });
});
