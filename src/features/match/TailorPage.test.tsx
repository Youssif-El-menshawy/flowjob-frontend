import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/client';
import type { Cv, TailorDraft } from '@/shared/api/types';

const draft: TailorDraft = {
  id: 'd1', sourceCvId: 'cv1', matchId: 'm1', jobTitle: 'Backend Engineer', company: 'Acme',
  suggestions: [
    { id: 's0', section: 'summary', original: 'Old summary', suggested: 'New summary', reviewRequired: false },
    { id: 's1', section: 'experience', experienceId: '0', bulletIndex: 0, original: 'Old bullet', suggested: 'New bullet', reviewRequired: true },
  ],
  missingQualifications: ['Docker'], questions: ['Used Docker?'],
};
const sourceCv: Cv = {
  id: 'cv1', name: 'My CV', kind: 'original', createdAt: '', updatedAt: '',
  content: {
    fullName: 'A', email: 'a@x.com', phone: '', location: '', links: [], summary: 'Old summary',
    experience: [{ id: '0', title: 'Dev', company: 'Acme', start: '2022-01', end: '', bullets: ['Old bullet'] }],
    education: [], projects: [], skills: [], languages: '',
  },
};

const mocks = vi.hoisted(() => ({
  create: { mutate: vi.fn(), isPending: false },
  tailorMutate: vi.fn(),
  tailorError: null as unknown,
  draftQuery: { data: undefined as unknown, isError: false, error: null as unknown },
  draftIds: [] as (string | undefined)[],
  preview: vi.fn(),
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
  fetchCvPreviewPdf: (...a: unknown[]) => {
    mocks.preview(...a);
    return Promise.resolve(new Blob(['%PDF-']));
  },
}));
vi.mock('@/features/cv/HarvardPdfViewer', () => ({ HarvardPdfViewer: () => <div data-testid="pdf" /> }));

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

afterEach(() => {
  cleanup();
  mocks.create.mutate = vi.fn();
  mocks.tailorMutate = vi.fn();
  mocks.tailorError = null;
  mocks.draftQuery = { data: undefined, isError: false, error: null };
  mocks.draftIds = [];
  mocks.preview = vi.fn();
});

describe('TailorPage', () => {
  it('renders suggestions, review flag, gaps and questions', () => {
    renderPage();
    expect(screen.getByText('Summary')).toBeTruthy();
    expect(screen.getByText('Experience')).toBeTruthy();
    expect(screen.getByText(/review — confirm it is true/i)).toBeTruthy(); // s1 flagged
    expect(screen.getByText(/Gaps this job asks for/i)).toBeTruthy();
    expect(screen.getAllByText(/Docker/).length).toBeGreaterThanOrEqual(2); // gap + question
    // Grounded suggestion kept by default, review-required one not → 1 of 2.
    expect(screen.getByText(/1 of 2 suggestions kept/i)).toBeTruthy();
  });

  it('requires the truthfulness checkbox before saving, and saves accepted changes with sourceCvId', () => {
    renderPage();
    const save = screen.getByRole('button', { name: /Save as new CV/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByText(/everything in it is true/i));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(mocks.create.mutate).toHaveBeenCalledTimes(1);
    const payload = mocks.create.mutate.mock.calls[0][0];
    expect(payload.kind).toBe('tailored');
    expect(payload.sourceCvId).toBe('cv1');
    expect(payload.content.summary).toBe('New summary'); // s0 accepted
    expect(payload.content.experience[0].bullets[0]).toBe('Old bullet'); // s1 (review) not accepted
  });

  it('lets the user edit a suggestion before saving', () => {
    renderPage();
    const textareas = screen.getAllByLabelText('Suggested wording');
    fireEvent.change(textareas[0], { target: { value: 'My edited summary' } });
    fireEvent.click(screen.getByText(/everything in it is true/i));
    fireEvent.click(screen.getByRole('button', { name: /Save as new CV/i }));
    expect(mocks.create.mutate.mock.calls[0][0].content.summary).toBe('My edited summary');
  });

  it('match-linked path creates the draft once, and review interactions trigger no further AI request', () => {
    renderPage();
    expect(mocks.tailorMutate).toHaveBeenCalledTimes(1);
    expect(mocks.tailorMutate).toHaveBeenCalledWith('m1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[1]);
    fireEvent.change(screen.getAllByLabelText('Suggested wording')[0], { target: { value: 'typed text' } });
    fireEvent.click(screen.getByText(/everything in it is true/i));
    expect(mocks.tailorMutate).toHaveBeenCalledTimes(1);
    expect(mocks.draftIds.every((id) => id === undefined || id === '')).toBe(true); // match path never reads a draft id
  });

  it('accept / reject toggles change what is saved, and the original CV object is untouched', () => {
    const before = JSON.stringify(sourceCv);
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]); // reject the summary
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[1]); // accept the review-required bullet
    fireEvent.click(screen.getByText(/everything in it is true/i));
    fireEvent.click(screen.getByRole('button', { name: /Save as new CV/i }));
    const payload = mocks.create.mutate.mock.calls[0][0];
    expect(payload.content.summary).toBe('Old summary'); // rejected → original wording
    expect(payload.content.experience[0].bullets[0]).toBe('New bullet');
    expect(payload.sourceCvId).toBe('cv1');
    expect(payload.kind).toBe('tailored');
    expect(JSON.stringify(sourceCv)).toBe(before); // saving builds a clone, never mutates the source
    expect(payload.content).not.toBe(sourceCv.content);
  });

  it('keeps review-required suggestions unchecked by default', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: 'Undo' })[1]).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('TailorPage direct draft route (/app/tailor/:draftId)', () => {
  it('loads the draft from the backend by id — no tailoring request, no matchId needed', () => {
    mocks.draftQuery = { data: directDraft, isError: false, error: null };
    renderPage('/app/tailor/d9');
    expect(mocks.draftIds).toContain('d9');
    expect(mocks.tailorMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: /Tailor your CV for Acme/ })).toBeInTheDocument();
    expect(screen.getByText(/Gaps this job asks for/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Job Match/i })).toHaveAttribute('href', '/app/match');
  });

  it('survives a refresh: a fresh mount re-reads the same draft by id and makes no AI request', () => {
    mocks.draftQuery = { data: directDraft, isError: false, error: null };
    renderPage('/app/tailor/d9');
    cleanup();
    renderPage('/app/tailor/d9');
    expect(mocks.draftIds.filter((i) => i === 'd9').length).toBeGreaterThanOrEqual(2);
    expect(mocks.tailorMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/1 of 2 suggestions kept/i)).toBeTruthy();
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
