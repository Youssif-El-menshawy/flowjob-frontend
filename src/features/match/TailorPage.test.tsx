import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const mocks = vi.hoisted(() => ({ create: { mutate: vi.fn(), isPending: false } }));

vi.mock('@/shared/api/queries', () => ({
  useCvs: () => ({ data: [sourceCv] }),
  useMatch: () => ({ data: { company: 'Acme', jobTitle: 'Backend Engineer' } }),
  useTailor: () => ({
    isError: false,
    mutate: (_matchId: string, opts: { onSuccess: (d: TailorDraft) => void }) => opts.onSuccess(draft),
  }),
  useCreateCv: () => mocks.create,
  fetchCvPreviewPdf: () => Promise.resolve(new Blob(['%PDF-'])),
}));
vi.mock('@/features/cv/HarvardPdfViewer', () => ({ HarvardPdfViewer: () => <div data-testid="pdf" /> }));

import TailorPage from './TailorPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/match/m1/tailor']}>
      <Routes>
        <Route path="/app/match/:matchId/tailor" element={<TailorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  mocks.create.mutate = vi.fn();
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
});
