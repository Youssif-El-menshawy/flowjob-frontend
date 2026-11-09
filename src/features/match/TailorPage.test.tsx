import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/client';
import type { Cv, TailorDraft } from '@/shared/api/types';

const draft: TailorDraft = {
  id: 'd1', sourceCvId: 'cv1', matchId: 'm1', jobTitle: 'Backend Engineer', company: 'Acme',
  suggestions: [
    { id: 's0', section: 'summary', original: 'Old summary', suggested: 'New summary', explanation: 'Lead with relevant experience.', reviewRequired: false },
    { id: 's1', section: 'experience', experienceId: '0', bulletIndex: 0, original: 'Old bullet', suggested: 'New bullet', reviewRequired: true },
  ],
  missingQualifications: ['Docker'], questions: ['Used Docker?'],
};
const sourceCv: Cv = {
  id: 'cv1', name: 'My CV', kind: 'original', createdAt: '', updatedAt: '',
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
  draftQuery: { data: undefined as unknown, isError: false, error: null as unknown },
  draftIds: [] as (string | undefined)[],
  preview: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@/shared/api/queries', () => ({
  useCvs: () => ({ data: [sourceCv], isLoading: false }),
  useTailor: () => ({
    isError: !!mocks.tailorError,
    error: mocks.tailorError,
    mutate: (matchId: string, opts: { onSuccess: (d: TailorDraft) => void }) => {
      mocks.tailorMutate(matchId);
      if (!mocks.tailorError) opts.onSuccess(draft);
    },
  }),
  useTailorDraft: (id?: string) => {
    mocks.draftIds.push(id);
    return mocks.draftQuery;
  },
  useCreateCv: () => mocks.create,
  fetchCvPreviewPdf: (...args: unknown[]) => mocks.preview(...args),
}));
vi.mock('@/shared/lib/utils', async (original) => ({
  ...await original<typeof import('@/shared/lib/utils')>(),
  downloadBlob: mocks.download,
}));
vi.mock('@/features/cv/HarvardPdfViewer', () => ({
  HarvardPdfViewer: ({ blob }: { blob: Blob | null }) => <div data-testid="pdf">{blob?.type ?? 'empty'}</div>,
}));

import TailorPage from './TailorPage';

function renderPage(path = '/app/match/m1/tailor') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/match/:matchId/tailor" element={<TailorPage />} />
        <Route path="/app/tailor/:draftId" element={<TailorPage />} />
        <Route path="/app/match" element={<div>JOB FORM</div>} />
        <Route path="/app/cvs" element={<div>MY CVS</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const directDraft: TailorDraft = { ...draft, id: 'd9', matchId: undefined };

beforeEach(() => {
  mocks.preview.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
});

afterEach(() => {
  cleanup();
  mocks.create.mutate = vi.fn();
  mocks.tailorMutate = vi.fn();
  mocks.tailorError = null;
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
  it('collapses details, applies normal suggestions and keeps factual warnings visible', () => {
    renderPage();
    expect(toggle('Summary')).toHaveAttribute('aria-expanded', 'false');
    expect(toggle('Experience')).toHaveAttribute('aria-expanded', 'false');
    expect(card('Summary').getByText('Applied')).toBeInTheDocument();
    expect(card('Summary').getByText('Lead with relevant experience.')).toBeInTheDocument();
    expect(card('Experience').getByText('Needs review')).toBeInTheDocument();
    expect(card('Experience').getByText(/Verify against your original CV/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Suggested wording' })).toBeNull();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Original CV protected')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 suggestions applied')).toBeInTheDocument();
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({
      summary: 'New summary',
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
      kind: 'tailored', sourceCvId: 'cv1', company: 'Acme', matchId: 'm1', jobTitle: 'Backend Engineer',
      content: { summary: 'Old summary', experience: [{ bullets: ['Verified bullet'] }] },
    });
    expect(sourceCv).toEqual(before);
    expect(payload.content).not.toBe(sourceCv.content);
    expect(mocks.tailorMutate).toHaveBeenCalledExactlyOnceWith('m1');
  });

  it('shows missing requirements without rendering or applying conversational questions', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Requirements not evidenced in your CV' })).toBeInTheDocument();
    expect(screen.getByText('Docker')).toBeVisible();
    expect(screen.queryByText('Used Docker?')).toBeNull();
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
    fireEvent.change(wording('Skills'), { target: { value: 'Python, MongoDB, Rust' } });
    expect(card('Skills').getByText('Needs review')).toBeVisible();
    expect(save()).toBeDisabled();
    confirm();
    fireEvent.click(save());
    expect(mocks.create.mutate.mock.calls[0][0].content.skills).toEqual(['Python', 'MongoDB']);
    expect(mocks.tailorMutate).not.toHaveBeenCalled();
  });
});

describe('TailorPage PDF preview and download', () => {
  it('refreshes on an explicit preview update, never on edits or review decisions', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());
    fireEvent.click(toggle('Summary'));
    fireEvent.change(wording('Summary'), { target: { value: 'Latest summary' } });
    fireEvent.click(toggle('Experience'));
    decide('Experience', 'Keep original');
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Preview out of date')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Update preview' }));
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(mocks.preview.mock.calls[1][0]).toMatchObject({ summary: 'Latest summary', experience: [{ bullets: ['Old bullet'] }] });
    expect(mocks.tailorMutate).toHaveBeenCalledExactlyOnceWith('m1');
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
    expect(mocks.tailorMutate).toHaveBeenCalledExactlyOnceWith('m1');
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
    const blob = new Blob(['%PDF-current']);
    await act(async () => finish(blob));
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(blob, 'Reviewed_version.pdf');
    expect(screen.getByText('Preview out of date')).toBeVisible();
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

  it('survives a refresh: a fresh mount re-reads the same draft by id and makes no AI request', () => {
    mocks.draftQuery = { data: directDraft, isError: false, error: null };
    renderPage('/app/tailor/d9');
    cleanup();
    renderPage('/app/tailor/d9');
    expect(mocks.draftIds.filter((i) => i === 'd9').length).toBeGreaterThanOrEqual(2);
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
