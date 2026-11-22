import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Outlet, Route, RouterProvider, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/client';
import type { Cv, TailorDraft, TailorMatchInput } from '@/shared/api/types';

const draft: TailorDraft = {
  id: 'd1', sourceCvId: 'cv1', sourceCvRevision: 'revision-1', matchId: 'm1', jobTitle: 'Backend Engineer', company: 'Acme',
  suggestions: [
    { id: 's0', section: 'summary', original: 'Old summary', suggested: 'Old summary.', explanation: 'Lead with relevant experience.', reviewRequired: false },
    { id: 's1', section: 'experience', experienceId: '0', bulletIndex: 0, original: 'Old bullet', suggested: 'New bullet', reviewRequired: true },
  ],
  missingQualifications: ['Docker'], questions: ['Used Docker?'],
};
const sourceCv: Cv = {
  id: 'cv1', name: 'My CV', kind: 'original', createdAt: '', updatedAt: '', contentRevision: 'revision-1',
  content: {
    fullName: 'A', email: 'a@x.com', phone: '', location: '', links: [], summary: 'Old summary',
    experience: [{ id: '0', title: 'Dev', company: 'Acme', start: '2022-01', end: '', bullets: ['Old bullet'] }],
    education: [], projects: [], skills: ['Python', 'MongoDB'], languages: '',
  },
};

const mocks = vi.hoisted(() => ({
  create: { mutate: vi.fn(), isPending: false },
  tailorMutate: vi.fn(),
  tailorError: null as unknown,
  tailorPending: false,
  draftQuery: { data: undefined as unknown, isError: false, error: null as unknown },
  draftIds: [] as (string | undefined)[],
  source: undefined as Cv | undefined,
  match: undefined as unknown,
  sourceFetching: false,
  refetchSource: vi.fn(),
  runMatch: vi.fn(),
  runPending: false,
  runError: null as unknown,
  preview: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@/shared/api/queries', () => ({
  useCvs: () => ({ data: [sourceCv], isLoading: false }),
  useMatch: () => ({ data: mocks.match }),
  useCv: () => ({
    data: mocks.source,
    isFetching: mocks.sourceFetching,
    isFetchedAfterMount: !mocks.sourceFetching,
    refetch: mocks.refetchSource,
  }),
  useTailor: () => ({
    isPending: mocks.tailorPending,
    isError: !!mocks.tailorError,
    error: mocks.tailorError,
    mutate: (input: TailorMatchInput, opts: { onSuccess: (d: TailorDraft) => void }) => {
      mocks.tailorMutate(input);
      if (!mocks.tailorError) {
        mocks.draftQuery = { data: draft, isError: false, error: null };
        opts.onSuccess(draft);
      }
    },
  }),
  useTailorDraft: (id?: string) => {
    mocks.draftIds.push(id);
    return mocks.draftQuery;
  },
  useCreateCv: () => mocks.create,
  useRunMatch: () => ({
    mutate: mocks.runMatch, isPending: mocks.runPending, isError: !!mocks.runError, error: mocks.runError,
  }),
  fetchCvPreviewPdf: (...args: unknown[]) => mocks.preview(...args),
}));
vi.mock('@/shared/lib/utils', async (original) => ({
  ...await original<typeof import('@/shared/lib/utils')>(),
  downloadBlob: mocks.download,
}));
vi.mock('@/features/cv/HarvardPdfViewer', () => ({
  HarvardPdfViewer: ({ blob }: { blob: Blob | null }) => <div data-testid="pdf">{blob?.type ?? 'empty'}</div>,
}));

import { ToastProvider } from '@/shared/ui/Overlay';
import { guardedRouter, unload } from '@/test/guardedRouter';
import TailorPage from './TailorPage';

function page(path = '/app/match/m1/tailor') {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/match/:matchId/tailor" element={<TailorPage />} />
        <Route path="/app/tailor/:draftId" element={<TailorPage />} />
        <Route path="/app/match" element={<div>JOB FORM</div>} />
        <Route path="/app/cvs" element={<div>MY CVS</div>} />
        <Route path="/app/match/:id" element={<div>MATCH REPORT</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPage(path?: string) {
  const rendered = render(page(path));
  if (!path) {
    const start = screen.queryByRole('button', { name: 'Start tailoring' });
    if (start) fireEvent.click(start);
  }
  return rendered;
}

const directDraft: TailorDraft = { ...draft, id: 'd9', matchId: undefined };

beforeEach(() => {
  mocks.source = sourceCv;
  mocks.sourceFetching = false;
  mocks.refetchSource.mockClear();
  mocks.preview.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  mocks.create.mutate = vi.fn();
  mocks.tailorMutate = vi.fn();
  mocks.tailorError = null;
  mocks.runPending = false;
  mocks.runError = null;
  mocks.runMatch = vi.fn();
  mocks.tailorPending = false;
  mocks.create.isPending = false;
  mocks.match = undefined;
  mocks.draftQuery = { data: undefined, isError: false, error: null };
  mocks.draftIds = [];
  mocks.preview.mockReset();
  mocks.download.mockReset();
});

const confirm = () => fireEvent.click(screen.getByRole('checkbox', { name: /everything in it is true/i }));
const save = () => screen.getByRole('button', { name: 'Save as new CV' });
const download = () => screen.getByRole('button', { name: 'Download tailored PDF' });
const toggle = (section: string) => screen.getByRole('button', { name: new RegExp(`^${section} `) });
const card = (section: string) => within(toggle(section).closest('article')!);
const wording = (section: string) => card(section).getByRole('textbox', { name: 'Suggested wording' });
const decide = (section: string, label: 'Apply suggestion' | 'Keep original') =>
  fireEvent.click(card(section).getByRole('button', { name: label }));

describe('TailorPage review', () => {
  it('collapses details, applies normal suggestions and offers the decision on the closed card', () => {
    renderPage();
    expect(toggle('Summary')).toHaveAttribute('aria-expanded', 'false');
    expect(toggle('Experience')).toHaveAttribute('aria-expanded', 'false');
    expect(card('Summary').getByText('Applied')).toBeInTheDocument();
    expect(card('Summary').getByText('Lead with relevant experience.')).toBeInTheDocument();
    expect(card('Experience').getByText('Needs review')).toBeInTheDocument();
    // The new wording and both decisions are on the closed card: no warning line, no need to open it.
    expect(screen.queryByText(/Verify against your original CV/)).toBeNull();
    expect(card('Experience').getByText('New bullet')).toBeVisible();
    expect(card('Experience').getByRole('button', { name: 'Apply suggestion' })).toBeEnabled();
    expect(card('Experience').getByRole('button', { name: 'Keep original' })).toBeEnabled();
    // The card names its target (role and bullet) and shows a short excerpt of the original text.
    expect(toggle('Experience')).toHaveTextContent('Experience · Dev, bullet 1');
    expect(card('Experience').getByText('“Old bullet”')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Suggested wording' })).toBeNull();
    expect(screen.queryByText('Draft', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Original CV protected')).not.toBeInTheDocument();
    const suggestionHeader = screen.getByRole('heading', { name: 'AI suggestions' }).closest('header')!;
    expect(within(suggestionHeader).getByText('1 of 2 suggestions applied')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'CV preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.queryByText(/Confirm the wording above/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Rendering Harvard PDF preview');
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({
      summary: 'Old summary.',
      experience: [{ bullets: ['Old bullet'] }],
    });
  });

  it('keeps independently expanded cards, edits and decisions when details close and reopen', () => {
    renderPage();
    fireEvent.click(toggle('Summary'));
    fireEvent.click(toggle('Experience'));
    expect(toggle('Summary')).toHaveAttribute('aria-expanded', 'true');
    expect(toggle('Experience')).toHaveAttribute('aria-expanded', 'true');
    expect(card('Summary').getByText('Old summary')).toBeInTheDocument();
    fireEvent.change(wording('Summary'), { target: { value: 'My revised summary' } });
    decide('Summary', 'Keep original');
    fireEvent.click(toggle('Summary'));
    expect(toggle('Experience')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle('Summary'));
    expect(wording('Summary')).toHaveValue('My revised summary');
    expect(card('Summary').getByText('Original kept')).toBeInTheDocument();
    expect(card('Summary').getByRole('button', { name: 'Keep original' })).toHaveAttribute('aria-pressed', 'true');
    decide('Summary', 'Apply suggestion');
    expect(card('Summary').getByText('Applied')).toBeInTheDocument();
  });

  it('saves only reviewed changes as a new CV and leaves the source unchanged', () => {
    const before = structuredClone(sourceCv);
    renderPage();
    expect(save()).toBeDisabled();
    fireEvent.click(toggle('Summary'));
    decide('Summary', 'Keep original');
    fireEvent.click(toggle('Experience'));
    fireEvent.change(wording('Experience'), { target: { value: 'Verified bullet' } });
    decide('Experience', 'Apply suggestion');
    confirm();
    fireEvent.click(save());
    expect(mocks.create.mutate).toHaveBeenCalledTimes(1);
    const payload = mocks.create.mutate.mock.calls[0][0];
    expect(payload).toMatchObject({
      kind: 'tailored', sourceCvId: 'cv1', tailorDraftId: 'd1', company: 'Acme', matchId: 'm1', jobTitle: 'Backend Engineer',
      content: { summary: 'Old summary', experience: [{ bullets: ['Verified bullet'] }] },
    });
    expect(sourceCv).toEqual(before);
    expect(payload.content).not.toBe(sourceCv.content);
    expect(mocks.tailorMutate).toHaveBeenCalledExactlyOnceWith({ matchId: 'm1' });
  });

  it('shows missing requirements and the questions as prompts, without applying anything from them', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Requirements not evidenced in your CV' })).toBeInTheDocument();
    expect(screen.getByText('Docker')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Questions that could strengthen this CV' })).toBeInTheDocument();
    expect(screen.getByText('Used Docker?')).toBeVisible();
    expect(screen.getByText(/add it to your original CV in your own words/)).toBeVisible();
    expect(mocks.preview.mock.calls[0][0].skills).toEqual(sourceCv.content.skills);
  });

  it('shows skills changes and keeps additions and removals out until explicitly applied', () => {
    mocks.draftQuery = { data: {
      ...directDraft,
      suggestions: [{ id: 'skills', section: 'skills', original: 'Python, MongoDB', suggested: 'Python, Docker' }],
    }, isError: false, error: null };
    renderPage('/app/tailor/d9');
    expect(card('Skills').getByText('Needs review')).toBeVisible();
    expect(mocks.preview.mock.calls[0][0].skills).toEqual(['Python', 'MongoDB']);
    fireEvent.click(toggle('Skills'));
    expect(card('Skills').getByText('Retained:').parentElement).toHaveTextContent('Retained: Python');
    expect(card('Skills').getByText('Added if applied:').parentElement).toHaveTextContent('Added if applied: Docker');
    expect(card('Skills').getByText('Removed if applied:').parentElement).toHaveTextContent('Removed if applied: MongoDB');
    expect(card('Skills').getByText(/Apply only skills your original CV supports/)).toBeVisible();

    fireEvent.change(wording('Skills'), { target: { value: 'Python, MongoDB, REST APIs' } });
    decide('Skills', 'Apply suggestion');
    expect(card('Skills').getByText('Applied')).toBeInTheDocument();
    confirm();
    // Refining wording the user already approved keeps it approved, and the confirmation stays ticked.
    fireEvent.change(wording('Skills'), { target: { value: 'Python, MongoDB, Rust' } });
    expect(card('Skills').getByText('Applied')).toBeVisible();
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    expect(mocks.create.mutate.mock.calls[0][0].content.skills).toEqual(['Python', 'MongoDB', 'Rust']);
    expect(mocks.tailorMutate).not.toHaveBeenCalled();
  });

  it('applies a suggestion from the closed card and keeps the confirmation across later decisions', () => {
    renderPage();
    confirm();
    decide('Experience', 'Apply suggestion');
    expect(toggle('Experience')).toHaveAttribute('aria-expanded', 'false');
    expect(card('Experience').getByText('Applied')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /everything in it is true/i })).toBeChecked();
    decide('Summary', 'Keep original');
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    expect(mocks.create.mutate.mock.calls[0][0].content).toMatchObject({
      summary: 'Old summary', experience: [{ bullets: ['New bullet'] }],
    });
  });

  it('an emptied approved wording is not applied, and nothing pending is saved', () => {
    renderPage();
    decide('Experience', 'Apply suggestion');
    fireEvent.click(toggle('Experience'));
    fireEvent.change(wording('Experience'), { target: { value: '  ' } });
    expect(card('Experience').queryByText('Applied')).toBeNull();
    confirm();
    fireEvent.click(save());
    expect(mocks.create.mutate.mock.calls[0][0].content.experience[0].bullets).toEqual(['Old bullet']);
  });

  it('Apply all approves only pending, valid suggestions and leaves kept originals alone', () => {
    const three: TailorDraft = { ...directDraft, suggestions: [
      { id: 'a', op: 'rewrite', section: 'summary', original: 'Old summary', suggested: 'Sharper summary' },
      { id: 'b', op: 'rewrite', section: 'experience', experienceId: '0', bulletIndex: 0, original: 'Old bullet', suggested: 'Sharper bullet' },
      { id: 'c', op: 'add_skill', section: 'skills', original: 'Python, MongoDB', suggested: 'Python, MongoDB, FastAPI', skill: 'FastAPI', evidence: { path: 'projects.p1.tech', quote: 'FastAPI, React' } },
      { id: 'd', op: 'rewrite', section: 'experience', experienceId: 'missing', bulletIndex: 0, original: 'Gone', suggested: 'Nope' },
    ] };
    mocks.draftQuery = { data: three, isError: false, error: null };
    renderPage('/app/tailor/d9');
    expect(screen.getByText('0 of 4 suggestions applied')).toBeVisible();
    decide('Summary', 'Keep original');
    fireEvent.click(screen.getByRole('button', { name: 'Apply all 2' }));
    expect(screen.getByText('2 of 4 suggestions applied')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Apply all/ })).toBeNull();
    confirm();
    fireEvent.click(save());
    expect(mocks.create.mutate.mock.calls[0][0].content).toMatchObject({
      summary: 'Old summary', experience: [{ bullets: ['Sharper bullet'] }], skills: ['Python', 'MongoDB', 'FastAPI'],
    });
  });

  it('shows the words a rewrite brings in from outside the CV, until the user rewrites it themselves', () => {
    mocks.draftQuery = { data: { ...directDraft, suggestions: [
      { id: 'a', op: 'rewrite', section: 'summary', original: 'Old summary', suggested: 'Project Coordinator summary', newTerms: ['project', 'coordinator'] },
    ] }, isError: false, error: null };
    renderPage('/app/tailor/d9');
    expect(card('Summary').getByText(/Not in your CV:/).parentElement).toHaveTextContent(
      'Not in your CV: project, coordinator. Apply only if this is true for you.');
    fireEvent.click(toggle('Summary'));
    fireEvent.change(wording('Summary'), { target: { value: 'My own summary' } });
    expect(card('Summary').queryByText(/Not in your CV:/)).toBeNull();
  });

  it('keeps review progress across a refresh of the same draft, and not for another draft', () => {
    const first = renderPage();
    decide('Experience', 'Apply suggestion');
    fireEvent.click(toggle('Summary'));
    fireEvent.change(wording('Summary'), { target: { value: 'My own summary' } });
    confirm();
    first.unmount();
    renderPage('/app/tailor/d1');
    expect(card('Experience').getByText('Applied')).toBeVisible();
    fireEvent.click(toggle('Summary'));
    expect(wording('Summary')).toHaveValue('My own summary');
    expect(screen.getByRole('checkbox', { name: /everything in it is true/i })).toBeChecked();
    cleanup();
    mocks.draftQuery = { data: directDraft, isError: false, error: null };
    renderPage('/app/tailor/d9');
    expect(card('Experience').getByText('Needs review')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /everything in it is true/i })).not.toBeChecked();
  });

  it('after saving, offers the next steps for this job and forgets the finished review', () => {
    sessionStorage.setItem('flowjob.jobPosts', JSON.stringify({ m1: 'We need Python.' }));
    mocks.match = { score: 59, scoreAvailable: true, matched: [], partiallyMatched: [], missing: [] };
    mocks.create.mutate = vi.fn((input: { name: string }, opts: { onSuccess: (cv: unknown) => void }) =>
      opts.onSuccess({ id: 'new-cv', name: input.name }));
    mocks.runMatch = vi.fn((_input: unknown, opts: { onSuccess: (m: unknown) => void }) => opts.onSuccess({ id: 'm2' }));
    renderPage();
    decide('Experience', 'Apply suggestion');
    confirm();
    fireEvent.click(save());
    const done = within(screen.getByRole('dialog', { name: 'Acme v1 is saved' }));
    expect(done.getByText(/Your original CV has not changed/)).toBeVisible();
    expect(done.getByRole('link', { name: 'Add to Applications' })).toHaveAttribute(
      'href', '/app/applications/new?company=Acme&jobTitle=Backend+Engineer&cvId=new-cv');
    expect(done.getByRole('link', { name: 'Go to My CVs' })).toHaveAttribute('href', '/app/cvs');
    expect(done.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
    expect(within(done.getByRole('region', { name: 'Check your match' })).getByText('59%')).toBeVisible();
    // The review stays underneath the dialog.
    expect(screen.getByRole('heading', { name: 'AI suggestions' })).toBeInTheDocument();
    expect(sessionStorage.getItem('flowjob.tailorReview.d1')).toBeNull();
    fireEvent.click(done.getByRole('button', { name: 'Re-check my match' }));
    expect(mocks.runMatch.mock.calls[0][0]).toEqual({
      cvId: 'new-cv', jobTitle: 'Backend Engineer', jobDescription: 'We need Python.', company: 'Acme', jobUrl: undefined });
    // The re-check opens the new report (the match request itself keeps the post for it).
    expect(screen.getByText('MATCH REPORT')).toBeInTheDocument();
  });

  describe('the saved dialog', () => {
    const saveOnce = () => {
      mocks.create.mutate = vi.fn((input: { name: string }, opts: { onSuccess: (cv: unknown) => void; onSettled?: () => void }) => {
        opts.onSuccess({ id: 'new-cv', name: input.name });
        opts.onSettled?.();
      });
      renderPage();
      decide('Experience', 'Apply suggestion');
      confirm();
      fireEvent.click(save());
      return screen.getByRole('dialog', { name: 'Acme v1 is saved' });
    };

    it('focuses the next step, and Close or Escape return to the review', async () => {
      const dialog = saveOnce();
      await waitFor(() => expect(within(dialog).getByRole('link', { name: 'Add to Applications' })).toHaveFocus());
      expect(document.body.style.overflow).toBe('hidden');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('heading', { name: 'AI suggestions' })).toBeVisible();
      expect(document.body.style.overflow).toBe('');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Saved to My CVs' })).toHaveFocus());

      fireEvent.click(screen.getByRole('button', { name: 'Saved to My CVs' }));
      expect(screen.getByRole('dialog', { name: 'Acme v1 is saved' })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Saved to My CVs' })).toHaveFocus());
      expect(screen.getByRole('heading', { name: 'AI suggestions' })).toBeVisible();
    });

    it('never saves the same review twice', () => {
      saveOnce();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('button', { name: 'Save as new CV' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Saved to My CVs' }));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      fireEvent.click(screen.getByRole('button', { name: 'Saved to My CVs' }));
      expect(mocks.create.mutate).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog', { name: 'Acme v1 is saved' })).toBeInTheDocument();
    });

    it('ignores a second click while the save is still running', () => {
      mocks.create.mutate = vi.fn();
      renderPage();
      decide('Experience', 'Apply suggestion');
      confirm();
      fireEvent.click(save());
      fireEvent.click(save());
      expect(mocks.create.mutate).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('downloads the CV as it was saved, even after the review changes', async () => {
      const dialog = saveOnce();
      const savedContent = mocks.create.mutate.mock.calls[0][0].content;
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      decide('Experience', 'Keep original'); // a change after saving
      fireEvent.click(screen.getByRole('button', { name: 'Saved to My CVs' }));
      mocks.preview.mockClear();
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Download PDF' }));
      await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'Acme_v1.pdf'));
      expect(mocks.preview.mock.calls[0][0]).toEqual(savedContent);
      expect(mocks.preview.mock.calls[0][2]).toBe('d1');
    });

    it('Done leaves the review after saving', () => {
      saveOnce();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.getByText('MATCH REPORT')).toBeInTheDocument();
    });
  });

  it('lists what the job asks for from the match report, and nothing for a draft without a match', () => {
    mocks.match = {
      matched: [{ requirement: 'Python', importance: 'required', evidence: '' }],
      partiallyMatched: [{ requirement: 'REST APIs', importance: 'required', evidence: '' }],
      missing: [{ requirement: 'Kubernetes', importance: 'preferred', evidence: '' }],
    };
    const rendered = renderPage();
    const panel = within(screen.getByRole('region', { name: 'What this job asks for' }));
    expect(panel.getByText('1 of 3 shown in your CV')).toBeVisible();
    expect(panel.getByText('Python').closest('li')).toHaveTextContent('Shown in your CV: Python');
    expect(panel.getByText('REST APIs').closest('li')).toHaveTextContent('Partly shown: REST APIs');
    expect(panel.getByText('Kubernetes').closest('li')).toHaveTextContent('Not shown yet: Kubernetes');
    rendered.unmount();
    mocks.match = undefined;
    mocks.draftQuery = { data: directDraft, isError: false, error: null };
    renderPage('/app/tailor/d9');
    expect(screen.queryByRole('region', { name: 'What this job asks for' })).toBeNull();
  });
});

describe('TailorPage PDF preview and download', () => {
  it('refreshes on an explicit preview update, never on edits or review decisions', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());
    expect(screen.queryByText('Preview up to date')).not.toBeInTheDocument();
    fireEvent.click(toggle('Summary'));
    fireEvent.change(wording('Summary'), { target: { value: 'Latest summary' } });
    decide('Summary', 'Apply suggestion');
    fireEvent.click(toggle('Experience'));
    decide('Experience', 'Keep original');
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Preview out of date')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update preview' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Update preview' }));
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(mocks.preview.mock.calls[1][0]).toMatchObject({ summary: 'Latest summary', experience: [{ bullets: ['Old bullet'] }] });
    expect(mocks.tailorMutate).toHaveBeenCalledExactlyOnceWith({ matchId: 'm1' });
  });

  it('aborts obsolete previews and ignores late responses when changing the preview mode', async () => {
    let finish!: (blob: Blob) => void;
    mocks.preview.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    mocks.preview.mockResolvedValueOnce(new Blob(['original'], { type: 'application/original' }));
    renderPage();
    const signal = mocks.preview.mock.calls[0][1] as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    expect(signal.aborted).toBe(true);
    expect(mocks.preview.mock.calls[1][0]).toEqual(sourceCv.content);
    await waitFor(() => expect(screen.getByTestId('pdf')).toHaveTextContent('application/original'));
    await act(async () => finish(new Blob(['old tailored'], { type: 'application/tailored' })));
    expect(screen.getByTestId('pdf')).toHaveTextContent('application/original');
    expect(mocks.tailorMutate).toHaveBeenCalledExactlyOnceWith({ matchId: 'm1' });
  });

  it('downloads the latest accepted edits from a stale preview without saving or calling AI', async () => {
    mocks.draftQuery = { data: directDraft, isError: false, error: null };
    renderPage('/app/tailor/d9');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());
    expect(download()).toBeDisabled();
    fireEvent.click(download());
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle('Summary'));
    fireEvent.change(wording('Summary'), { target: { value: 'Latest confirmed summary' } });
    decide('Summary', 'Apply suggestion');
    fireEvent.click(toggle('Experience'));
    fireEvent.change(wording('Experience'), { target: { value: 'Rejected text' } });
    decide('Experience', 'Keep original');
    confirm();
    fireEvent.change(screen.getByLabelText('New CV name'), { target: { value: 'Reviewed version' } });
    let finish!: (blob: Blob) => void;
    mocks.preview.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    fireEvent.click(download());
    const preparing = screen.getByRole('button', { name: 'Preparing PDF…' });
    expect(preparing).toBeDisabled();
    fireEvent.click(preparing);
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(mocks.preview.mock.calls[1][0]).toMatchObject({
      summary: 'Latest confirmed summary', experience: [{ bullets: ['Old bullet'] }],
    });
    expect(mocks.preview.mock.calls[1][2]).toBe('d9');
    const blob = new Blob(['%PDF-current']);
    await act(async () => finish(blob));
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(blob, 'Reviewed_version.pdf');
    expect(screen.queryByText('Preview out of date')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update preview' })).toBeEnabled();
    expect(mocks.create.mutate).not.toHaveBeenCalled();
    expect(mocks.tailorMutate).not.toHaveBeenCalled();
  });

  it('reports download failures and allows a retry without creating a CV', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());
    confirm();
    mocks.preview.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(download());
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not download the tailored PDF.');
    expect(mocks.download).not.toHaveBeenCalled();
    fireEvent.click(download());
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.create.mutate).not.toHaveBeenCalled();
  });
});

describe('TailorPage direct draft route (/app/tailor/:draftId)', () => {
  it('loads the draft from the backend by id — no tailoring request, no matchId needed', () => {
    mocks.draftQuery = { data: directDraft, isError: false, error: null };
    renderPage('/app/tailor/d9');
    expect(mocks.draftIds).toContain('d9');
    expect(mocks.tailorMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: /Tailor your CV for Acme/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Requirements not evidenced in your CV' })).toBeInTheDocument();
    // "Back to Job Match" comes from the focused layout's top bar, not repeated in the page header.
    expect(screen.queryByRole('link', { name: /Back to Job Match/i })).toBeNull();
  });

  it.each([directDraft, draft])('reopens draft $id by id without generating a new draft', (savedDraft) => {
    mocks.draftQuery = { data: savedDraft, isError: false, error: null };
    renderPage(`/app/tailor/${savedDraft.id}`);
    cleanup();
    renderPage(`/app/tailor/${savedDraft.id}`);
    expect(mocks.draftIds.filter((i) => i === savedDraft.id).length).toBeGreaterThanOrEqual(2);
    expect(mocks.tailorMutate).not.toHaveBeenCalled();
    expect(screen.getByText('1 of 2 suggestions applied')).toBeTruthy();
  });

  it('saves a separate tailored CV without a matchId and does not call tailoring/preview AI', () => {
    mocks.draftQuery = { data: directDraft, isError: false, error: null };
    renderPage('/app/tailor/d9');
    fireEvent.click(screen.getByText(/everything in it is true/i));
    fireEvent.click(screen.getByRole('button', { name: /Save as new CV/i }));
    const payload = mocks.create.mutate.mock.calls[0][0];
    expect(payload).toMatchObject({ kind: 'tailored', sourceCvId: 'cv1', company: 'Acme' });
    expect(payload.matchId).toBeUndefined();
    expect(mocks.tailorMutate).not.toHaveBeenCalled();
  });

  it('Discard returns to the job form', () => {
    mocks.draftQuery = { data: directDraft, isError: false, error: null };
    renderPage('/app/tailor/d9');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByText('JOB FORM')).toBeInTheDocument();
  });

  it('shows a clear message for a missing, expired or someone else\'s draft (404)', () => {
    mocks.draftQuery = { data: undefined, isError: true, error: new ApiError(404, { message: 'Draft not found.' }) };
    renderPage('/app/tailor/gone');
    expect(screen.getByText('Draft not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Job Match/i })).toHaveAttribute('href', '/app/match');
    expect(mocks.tailorMutate).not.toHaveBeenCalled();
  });
});

describe('TailorPage errors', () => {
  it('shows the backend quota message when match-linked tailoring is refused', () => {
    mocks.tailorError = new ApiError(429, { message: 'Daily CV tailoring limit reached. Please try again tomorrow.' });
    renderPage();
    expect(screen.getByText('Could not tailor this CV')).toBeInTheDocument();
    expect(screen.getByText(/Daily CV tailoring limit reached/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to match' })).toHaveAttribute('href', '/app/match/m1');
  });

  it('shows a generic, non-technical message for non-API failures', () => {
    mocks.tailorError = new TypeError('Failed to fetch');
    renderPage();
    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });
});


describe('TailorPage source verification', () => {
  it('waits for source verification before applying suggestions to cached CV data', () => {
    mocks.sourceFetching = true;
    const rendered = renderPage();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save as new CV' })).not.toBeInTheDocument();
    mocks.sourceFetching = false;
    rendered.rerender(page());
    expect(screen.getByText('1 of 2 suggestions applied')).toBeVisible();
    expect(mocks.preview.mock.lastCall?.[2]).toBe('d1');
  });

  it('invalidates reviewed wording and confirmation after a source revision changes', async () => {
    const rendered = renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());
    fireEvent.click(toggle('Experience'));
    decide('Experience', 'Apply suggestion');
    confirm();
    expect(save()).toBeEnabled();

    const updated = structuredClone(sourceCv);
    updated.contentRevision = 'revision-2';
    updated.content.experience[0].bullets.unshift('A different bullet');
    mocks.source = updated;
    rendered.rerender(page());

    expect(screen.getByRole('alert')).toHaveTextContent('source CV changed');
    expect(card('Experience').getByRole('button', { name: 'Apply suggestion' })).toBeDisabled();
    expect(screen.getByText('0 of 2 suggestions applied')).toBeVisible();
    expect(save()).toBeDisabled();
    expect(download()).toBeDisabled();
    expect(mocks.preview.mock.lastCall?.[0]).toEqual(updated.content);
    expect(mocks.preview.mock.lastCall?.[2]).toBeUndefined();
    expect(mocks.tailorMutate).toHaveBeenCalledTimes(1);
    expect(mocks.create.mutate).not.toHaveBeenCalled();
  });

  it.each([
    { experienceId: '0', bulletIndex: 0, original: 'Earlier bullet text' },
    { experienceId: '0', bulletIndex: 0, original: '' },
    { experienceId: 'missing', bulletIndex: 0, original: 'Old bullet' },
    { experienceId: '0', bulletIndex: 4, original: 'Old bullet' },
  ])('blocks an invalid target even when the source revision matches (%o)', (change) => {
    mocks.draftQuery = { data: {
      ...directDraft,
      suggestions: [{ ...draft.suggestions[1], ...change, reviewRequired: false }],
    }, isError: false, error: null };
    renderPage('/app/tailor/d9');
    fireEvent.click(toggle('Experience'));
    expect(card('Experience').getByRole('button', { name: 'Apply suggestion' })).toBeDisabled();
    expect(screen.getByText('0 of 1 suggestions applied')).toBeVisible();
    expect(mocks.preview.mock.lastCall?.[0]).toEqual(sourceCv.content);
    confirm();
    fireEvent.click(save());
    expect(mocks.create.mutate.mock.lastCall?.[0].content).toEqual(sourceCv.content);
  });

  it('keeps older drafts readable while blocking apply, download and save', () => {
    mocks.draftQuery = { data: { ...directDraft, sourceCvRevision: null }, isError: false, error: null };
    renderPage('/app/tailor/d9');
    expect(screen.getByRole('alert')).toHaveTextContent('older draft has no verified source revision');
    fireEvent.click(toggle('Summary'));
    expect(card('Summary').getByText('Old summary')).toBeVisible();
    expect(card('Summary').getByRole('button', { name: 'Apply suggestion' })).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(save()).toBeDisabled();
    expect(download()).toBeDisabled();
    expect(mocks.preview.mock.lastCall?.[0]).toEqual(sourceCv.content);
    expect(mocks.tailorMutate).not.toHaveBeenCalled();
  });

  it('does not accept a different source CV with the same content revision', () => {
    mocks.source = { ...sourceCv, id: 'other-cv' };
    renderPage();
    expect(screen.getByText('Could not verify the source CV')).toBeVisible();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.create.mutate).not.toHaveBeenCalled();
  });

  it('requires an explicit decision for a factual addition and shares the reviewed content across all outputs', async () => {
    mocks.draftQuery = { data: {
      ...directDraft,
      suggestions: [{ ...draft.suggestions[0], suggested: 'Old summary. AWS certified.', reviewRequired: true }],
    }, isError: false, error: null };
    renderPage('/app/tailor/d9');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());
    expect(card('Summary').getByText('Needs review')).toBeVisible();
    expect(mocks.preview.mock.lastCall?.[0].summary).toBe('Old summary');
    fireEvent.click(toggle('Summary'));
    // The user corrects the unsupported wording and explicitly approves the replacement.
    fireEvent.change(wording('Summary'), { target: { value: 'Old summary. APIs maintained.' } });
    decide('Summary', 'Apply suggestion');
    fireEvent.click(screen.getByRole('button', { name: 'Update preview' }));
    const [previewContent, , previewDraftId] = mocks.preview.mock.lastCall!;
    confirm();
    fireEvent.click(download());
    const [downloadContent, , downloadDraftId] = mocks.preview.mock.lastCall!;
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    fireEvent.click(save());
    const saved = mocks.create.mutate.mock.lastCall?.[0];
    expect(previewContent.summary).toBe('Old summary. APIs maintained.');
    expect(downloadContent).toEqual(previewContent);
    expect(saved).toMatchObject({ content: previewContent, tailorDraftId: 'd9' });
    expect([previewDraftId, downloadDraftId]).toEqual(['d9', 'd9']);
    expect(sourceCv.content.summary).toBe('Old summary');
  });

  it('blocks a download and subsequent saves if the server detects a newer source', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());
    confirm();
    mocks.preview.mockRejectedValueOnce(new ApiError(409, { message: 'The source CV changed.' }));
    fireEvent.click(download());
    expect(await screen.findByRole('alert')).toHaveTextContent('source CV changed');
    expect(save()).toBeDisabled();
    expect(download()).toBeDisabled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.refetchSource).toHaveBeenCalledTimes(1);
  });
});

it('does not generate on the old match URL until the user explicitly starts tailoring', () => {
  renderPage('/app/match/m1/tailor');
  expect(mocks.tailorMutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Start tailoring' }));
  expect(mocks.tailorMutate).toHaveBeenCalledExactlyOnceWith({ matchId: 'm1' });
  expect(mocks.draftIds).toContain('d1');
  expect(screen.getByRole('link', { name: /Back to match result/ })).toHaveAttribute('href', '/app/match/m1');
});


it('identifies a missing wire revision as a backend mismatch, not a legacy draft', () => {
  mocks.draftQuery = { data: { ...directDraft, sourceCvRevision: undefined }, isError: false, error: null };
  renderPage('/app/tailor/d9');
  expect(screen.getByRole('alert')).toHaveTextContent('running backend does not support verified tailoring drafts');
  expect(screen.queryByText(/older draft has no verified source revision/)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Start a fresh draft' })).not.toBeInTheDocument();
  expect(mocks.tailorMutate).not.toHaveBeenCalled();
  expect(save()).toBeDisabled();
});

it('regenerates a legacy match draft only after the user clicks and opens a verified draft', () => {
  mocks.draftQuery = { data: { ...draft, id: 'legacy', sourceCvRevision: null }, isError: false, error: null };
  renderPage('/app/tailor/legacy');
  expect(mocks.tailorMutate).not.toHaveBeenCalled();
  expect(save()).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Create fresh draft' }));
  expect(mocks.tailorMutate).toHaveBeenCalledExactlyOnceWith({ matchId: 'm1', cvId: 'cv1', fresh: true });
  expect(mocks.draftIds).toContain('d1');
  expect(screen.getByText('1 of 2 suggestions applied')).toBeVisible();
  expect(mocks.preview.mock.lastCall?.[2]).toBe('d1');
});

it('sends a direct legacy draft back to the job form to re-enter the description', () => {
  mocks.draftQuery = { data: { ...directDraft, sourceCvRevision: null }, isError: false, error: null };
  renderPage('/app/tailor/d9');
  expect(screen.getByText('Paste the job description again to create a fresh draft.')).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: 'Start a fresh draft' }));
  expect(screen.getByText('JOB FORM')).toBeVisible();
  expect(mocks.tailorMutate).not.toHaveBeenCalled();
});

describe('Re-check my match in the saved dialog', () => {
  const POST = 'We need Python and REST APIs. Three years of backend experience with MongoDB.';
  type RunOpts = { onSuccess: (m: { id: string }) => void; onSettled?: () => void };

  function saveFrom(path: string, posts: Record<string, string> = {}) {
    sessionStorage.setItem('flowjob.jobPosts', JSON.stringify(posts));
    mocks.create.mutate = vi.fn((input: { name: string }, opts: { onSuccess: (cv: unknown) => void; onSettled?: () => void }) => {
      opts.onSuccess({ id: 'new-cv', name: input.name });
      opts.onSettled?.();
    });
    render(<ToastProvider>{page(path)}</ToastProvider>);
    decide('Experience', 'Apply suggestion');
    confirm();
    fireEvent.click(save());
    return within(screen.getByRole('dialog', { name: /is saved$/ }));
  }
  const recheck = (dialog: ReturnType<typeof within>) => dialog.queryByRole('button', { name: 'Re-check my match' });

  it('runs Job Match with the new CV and the same post, then opens the new result', () => {
    mocks.draftQuery = { data: draft, isError: false, error: null };
    mocks.match = { score: 59, scoreAvailable: true, matched: [], partiallyMatched: [], missing: [] };
    mocks.runMatch = vi.fn((_input: unknown, opts: RunOpts) => opts.onSuccess({ id: 'm2' }));
    const dialog = saveFrom('/app/tailor/d1', { m1: POST });
    expect(dialog.getByText(/Your earlier match result is kept/)).toBeVisible();
    fireEvent.click(recheck(dialog)!);
    // A new analysis for the NEW CV: nothing refers to (or replaces) the earlier match or the original CV.
    expect(mocks.runMatch.mock.calls[0][0]).toEqual({
      cvId: 'new-cv', jobTitle: 'Backend Engineer', jobDescription: POST, company: 'Acme', jobUrl: undefined });
    expect(screen.getByText('MATCH REPORT')).toBeInTheDocument();
  });

  it('offers it for a draft tailored straight from a pasted post, with exactly that post', () => {
    mocks.draftQuery = { data: directDraft, isError: false, error: null };
    const dialog = saveFrom('/app/tailor/d9', { 'draft:d9': POST });
    fireEvent.click(recheck(dialog)!);
    expect(mocks.runMatch.mock.calls[0][0]).toMatchObject({ cvId: 'new-cv', jobDescription: POST, jobTitle: 'Backend Engineer' });
  });

  it.each([
    ['a match whose post this tab no longer has', draft, '/app/tailor/d1', { m9: POST, 'draft:d5': POST }],
    ['a pasted-post draft whose post is gone', directDraft, '/app/tailor/d9', { m1: POST }],
  ])('is not offered for %s, and nothing is substituted', (_label, data, path, posts) => {
    mocks.draftQuery = { data, isError: false, error: null };
    const dialog = saveFrom(path, posts);
    expect(recheck(dialog)).toBeNull();
    expect(dialog.queryByText(/Re-check compares/)).toBeNull();
    // The other next steps stay.
    expect(dialog.getByRole('link', { name: 'Add to Applications' })).toBeVisible();
    expect(dialog.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
    expect(dialog.getByRole('link', { name: 'Go to My CVs' })).toBeVisible();
    expect(mocks.runMatch).not.toHaveBeenCalled();
  });

  it('uses the draft’s own post when its match entry is gone from this tab', () => {
    mocks.draftQuery = { data: draft, isError: false, error: null };
    const dialog = saveFrom('/app/tailor/d1', { 'draft:d1': POST });
    fireEvent.click(recheck(dialog)!);
    expect(mocks.runMatch.mock.calls[0][0]).toMatchObject({ cvId: 'new-cv', jobDescription: POST });
  });

  it('explains a missing post and offers Job Match with the new CV, without filling in any post', () => {
    mocks.draftQuery = { data: draft, isError: false, error: null };
    const dialog = saveFrom('/app/tailor/d1', {});
    expect(recheck(dialog)).toBeNull();
    expect(dialog.getByText(/FlowJob does not keep job posts after you sign out or open a\s+new tab/)).toBeVisible();
    fireEvent.click(dialog.getByRole('link', { name: 'Open Job Match' }));
    expect(screen.getByText('JOB FORM')).toBeInTheDocument();
  });

  it('sends one request however fast it is clicked', () => {
    mocks.draftQuery = { data: draft, isError: false, error: null };
    mocks.runMatch = vi.fn(); // still running
    const dialog = saveFrom('/app/tailor/d1', { m1: POST });
    const button = recheck(dialog)!;
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.runMatch).toHaveBeenCalledTimes(1);
  });

  it('shows that it is checking, for sight and screen readers', () => {
    mocks.draftQuery = { data: draft, isError: false, error: null };
    mocks.runPending = true;
    const dialog = saveFrom('/app/tailor/d1', { m1: POST });
    expect(dialog.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    expect(dialog.getByRole('status')).toHaveTextContent('Checking your new CV against the same job post');
  });

  it.each([
    [new ApiError(429, { message: 'Daily AI match limit reached. Please try again tomorrow.' }), 'Daily AI match limit reached'],
    [new ApiError(503, { message: 'The AI service is at capacity today. Please try again tomorrow.' }), 'at capacity today'],
    [new TypeError('Failed to fetch'), 'Could not check the match. Please try again.'],
  ])('explains a failure (%s) and keeps every other action working', (error, text) => {
    mocks.draftQuery = { data: draft, isError: false, error: null };
    mocks.runError = error;
    const dialog = saveFrom('/app/tailor/d1', { m1: POST });
    expect(dialog.getByRole('alert')).toHaveTextContent(text);
    expect(recheck(dialog)).toBeEnabled(); // it can be tried again
    expect(dialog.getByRole('link', { name: 'Add to Applications' })).toBeVisible();
    expect(dialog.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
    expect(dialog.getByRole('link', { name: 'Go to My CVs' })).toBeVisible();
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closed while checking: stays on the review and offers the result instead of moving the page', () => {
    mocks.draftQuery = { data: draft, isError: false, error: null };
    let finish: RunOpts | undefined;
    mocks.runMatch = vi.fn((_input: unknown, opts: RunOpts) => {
      finish = opts;
    });
    const dialog = saveFrom('/app/tailor/d1', { m1: POST });
    fireEvent.click(recheck(dialog)!);
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
    act(() => {
      finish!.onSuccess({ id: 'm2' });
      finish!.onSettled?.();
    });
    expect(screen.queryByText('MATCH REPORT')).toBeNull();
    expect(screen.getByRole('heading', { name: 'AI suggestions' })).toBeInTheDocument();
    expect(screen.getByText('Your new match result is ready.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByText('MATCH REPORT')).toBeInTheDocument();
  });
});

describe('TailorPage interruption protection', () => {
  function renderGuarded(path: string) {
    const router = guardedRouter([{
      element: <><Outlet /><Link to="/app/cvs">Sidebar: My CVs</Link></>,
      children: [
        { path: '/app/match/:matchId/tailor', element: <TailorPage /> },
        { path: '/app/tailor/:draftId', element: <TailorPage /> },
        { path: '/app/cvs', element: <div>MY CVS</div> },
      ],
    }], [path]);
    render(<RouterProvider router={router} />);
    return router;
  }
  const sidebar = () => fireEvent.click(screen.getByRole('link', { name: 'Sidebar: My CVs' }));

  it('does not ask while reviewing: decisions are kept in this tab and the draft can be reopened', () => {
    mocks.draftQuery = { data: draft, isError: false, error: null };
    renderGuarded('/app/tailor/d1');
    decide('Experience', 'Apply suggestion');
    expect(unload()).toBe(true);
    sidebar();
    expect(screen.getByText('MY CVS')).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('flowjob.tailorReview.d1')!).decisions.s1).toBeTruthy();
  });

  it('remembers the new CV name with the review', () => {
    mocks.draftQuery = { data: draft, isError: false, error: null };
    renderGuarded('/app/tailor/d1');
    fireEvent.change(screen.getByLabelText('New CV name'), { target: { value: 'Acme backend' } });
    cleanup();
    renderGuarded('/app/tailor/d1');
    expect(screen.getByLabelText('New CV name')).toHaveValue('Acme backend');
  });

  it('while saving, says the save continues on the server and where the CV will be', () => {
    mocks.draftQuery = { data: draft, isError: false, error: null };
    mocks.create.isPending = true;
    renderGuarded('/app/tailor/d1');
    expect(unload()).toBe(false);
    sidebar();
    const dialog = screen.getByRole('dialog', { name: 'Leave while your CV is saved?' });
    expect(dialog).toHaveTextContent('Saving continues on the server');
    expect(dialog).toHaveTextContent('My CVs');
  });

  it('while a draft is created from a match, says it finishes and reopens without another try', () => {
    mocks.tailorPending = true;
    mocks.tailorMutate = vi.fn();
    renderGuarded('/app/match/m1/tailor');
    sidebar();
    const dialog = screen.getByRole('dialog', { name: 'Leave while your draft is created?' });
    expect(dialog).toHaveTextContent('will finish even if you leave');
    expect(dialog).toHaveTextContent('will not use another try');
    expect(dialog).not.toHaveTextContent(/cancel/i);
  });

  it('opens the finished draft without asking', () => {
    renderGuarded('/app/match/m1/tailor');
    fireEvent.click(screen.getByRole('button', { name: 'Start tailoring' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'AI suggestions' })).toBeInTheDocument();
  });
});

describe('saved dialog layout', () => {
  const POST = 'We need Python and REST APIs. Three years of backend experience with MongoDB.';
  function saveWith(posts: Record<string, string>, data: TailorDraft = draft) {
    sessionStorage.setItem('flowjob.jobPosts', JSON.stringify(posts));
    mocks.draftQuery = { data, isError: false, error: null };
    mocks.create.mutate = vi.fn((input: { name: string }, opts: { onSuccess: (cv: unknown) => void; onSettled?: () => void }) => {
      opts.onSuccess({ id: 'new-cv', name: input.name });
      opts.onSettled?.();
    });
    renderPage(`/app/tailor/${data.id}`);
    decide('Experience', 'Apply suggestion');
    confirm();
    fireEvent.click(save());
    return screen.getByRole('dialog', { name: /is saved$/ });
  }

  it('leads with Re-check as the one green button, the earlier score above it, and lighter actions below', () => {
    mocks.match = { score: 59, scoreAvailable: true, matched: [], partiallyMatched: [], missing: [] };
    const dialog = saveWith({ m1: POST });
    const check = within(dialog).getByRole('region', { name: 'Check your match' });
    const score = within(check).getByText('59%');
    const recheck = within(check).getByRole('button', { name: 'Re-check my match' });
    expect(within(check).getByText('Match before tailoring')).toBeVisible();
    // The score is shown above the button.
    expect(score.compareDocumentPosition(recheck) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recheck.className).toContain('bg-primary');
    expect(recheck.className).toContain('w-full');

    const apps = within(dialog).getByRole('link', { name: 'Add to Applications' });
    expect(apps.className).toContain('border'); // outlined, not filled
    expect(apps.className).not.toContain('bg-primary');
    // Only one filled (green) action in the whole dialog.
    expect(Array.from(dialog.querySelectorAll('a, button')).filter((el) => el.className.includes('bg-primary'))).toHaveLength(1);

    // Download PDF and Go to My CVs are plain text links, not buttons with a frame.
    const download = within(dialog).getByRole('button', { name: 'Download PDF' });
    const myCvs = within(dialog).getByRole('link', { name: 'Go to My CVs' });
    for (const el of [download, myCvs]) {
      expect(el.className).toContain('text-primary');
      expect(el.className).not.toContain('rounded-full');
    }
    // Close is a red X in the header beside the title; there is no footer Close or divider any more.
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close).toHaveTextContent('');
    expect(close.querySelector('svg')).not.toBeNull();
    expect(close.className).toContain('text-danger');
    const header = close.parentElement!;
    expect(within(header).getByRole('heading', { name: 'Acme v1 is saved' })).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button')[0]).toBe(close);
    expect(dialog.querySelector('.border-t')).toBeNull();
  });

  it('closes from the X, Escape or the background and returns to the review', async () => {
    const dialog = saveWith({ m1: POST });
    await waitFor(() => expect(within(dialog).getByRole('link', { name: 'Add to Applications' })).toHaveFocus());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved to My CVs' })).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Saved to My CVs' }));
    fireEvent.click(screen.getByRole('dialog').previousElementSibling!); // the dimmed background
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Saved to My CVs' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'AI suggestions' })).toBeInTheDocument();
  });

  it('offers Open Job Match as the main action when the post is not available', () => {
    mocks.match = { score: 59, scoreAvailable: true, matched: [], partiallyMatched: [], missing: [] };
    const dialog = saveWith({});
    const check = within(dialog).getByRole('region', { name: 'Check your match' });
    expect(within(check).queryByRole('button', { name: 'Re-check my match' })).toBeNull();
    const open = within(check).getByRole('link', { name: 'Open Job Match' });
    expect(open.className).toContain('bg-primary');
    expect(within(check).getByText('59%')).toBeVisible();
    expect(within(dialog).getByRole('link', { name: 'Add to Applications' })).toBeVisible();
  });

  it('shows no score line when there was no earlier match', () => {
    const dialog = saveWith({ 'draft:d9': POST }, directDraft);
    expect(within(dialog).queryByText('Match before tailoring')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Re-check my match' })).toBeEnabled();
  });

  it('keeps Download PDF working as a link-style action with its loading state', async () => {
    let release!: (b: Blob) => void;
    mocks.preview.mockImplementation(() => new Promise<Blob>((resolve) => { release = resolve; }));
    const dialog = saveWith({ m1: POST });
    mocks.preview.mockClear();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download PDF' }));
    const busy = within(dialog).getByRole('button', { name: 'Preparing PDF…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await act(async () => release(new Blob(['%PDF-'], { type: 'application/pdf' })));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'Acme_v1.pdf'));
    expect(within(dialog).getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  });
});
