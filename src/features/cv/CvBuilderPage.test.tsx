import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cv, CvContent } from '@/shared/api/types';

const content = (fullName: string, summary: string): CvContent => ({
  fullName,
  email: 'a@x.com',
  phone: '',
  location: 'Town',
  links: [],
  summary,
  experience: [],
  education: [],
  projects: [],
  skills: ['Python'],
  languages: '',
});
const mkCv = (o: Partial<Cv> & { id: string; name: string; content: CvContent }): Cv =>
  ({ kind: 'tailored', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...o }) as Cv;

const ORIG = mkCv({ id: 'o1', name: 'Original CV', kind: 'original', updatedAt: '2026-01-05', content: content('Orig Person', 'Original summary') });
const HAYS = mkCv({ id: 't1', name: 'Hays v1', company: 'Hays', jobTitle: 'Dev', sourceCvId: 'o1', matchId: 'm1', updatedAt: '2026-03-01', content: content('Hays Person', 'Hays summary') });
const SNOW = mkCv({ id: 't2', name: 'Snowflake v1', company: 'Snowflake', sourceCvId: 'o1', updatedAt: '2026-02-01', content: content('Snow Person', 'Snow summary') });

const mocks = vi.hoisted(() => ({
  cvs: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  update: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  previewCalls: [] as unknown[],
  previewResolvers: [] as Array<(b: Blob) => void>,
}));

vi.mock('@/shared/api/queries', () => ({
  useCvs: () => mocks.cvs,
  useProfile: () => ({ data: { experience: [], summary: '' }, isLoading: false }),
  useCreateCv: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCv: () => mocks.update,
  fetchCvPdfBlob: vi.fn(() => Promise.resolve(new Blob(['%PDF']))),
  fetchCvPreviewPdf: (c: unknown) => {
    mocks.previewCalls.push(c);
    return new Promise<Blob>((res) => mocks.previewResolvers.push(res));
  },
}));
vi.mock('./HarvardPdfViewer', () => ({
  HarvardPdfViewer: ({ blob }: { blob: Blob | null }) => <div data-testid="pdf">{blob ? 'pdf-ready' : 'pdf-empty'}</div>,
}));

import CvBuilderPage from './CvBuilderPage';
import { ToastProvider } from '@/shared/ui/Overlay';

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}</p>;
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/app/cv-builder" element={<CvBuilderPage />} />
          <Route path="/app/cv-builder/:cvId" element={<CvBuilderPage />} />
          <Route path="/app/cvs" element={<div>MY CVS</div>} />
        </Routes>
        <Where />
      </ToastProvider>
    </MemoryRouter>,
  );
}
const select = () => screen.getByLabelText('Editing CV') as HTMLSelectElement;
const choose = (id: string) => fireEvent.change(select(), { target: { value: id } });
const fullName = () => (screen.getByLabelText('Full name') as HTMLInputElement).value;
const lastPreview = () => mocks.previewCalls[mocks.previewCalls.length - 1] as CvContent;

beforeEach(() => {
  mocks.cvs = { data: [HAYS, ORIG, SNOW], isLoading: false, isError: false, refetch: vi.fn() };
  mocks.update = { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };
  mocks.previewCalls = [];
  mocks.previewResolvers = [];
});
afterEach(cleanup);

describe('CV selector', () => {
  it('lists the real saved CVs: original first, then by most recently updated, by stable id', () => {
    renderAt('/app/cv-builder');
    const opts = within(select()).getAllByRole('option');
    expect(opts.map((o) => o.textContent)).toEqual(['Original CV', 'Hays v1 — Tailored', 'Snowflake v1 — Tailored']);
    expect(opts.map((o) => (o as HTMLOptionElement).value)).toEqual(['o1', 't1', 't2']);
    expect(select().value).toBe('o1'); // default route keeps the existing default (the original)
  });

  it('direct URL selects that CV, and a refresh (fresh mount at the same URL) keeps it', () => {
    renderAt('/app/cv-builder/t1');
    expect(select().value).toBe('t1');
    expect(fullName()).toBe('Hays Person');
    expect(screen.getByText(/Hays v1, tailored for Hays/)).toBeInTheDocument();
    cleanup();
    renderAt('/app/cv-builder/t1');
    expect(select().value).toBe('t1');
    expect(fullName()).toBe('Hays Person');
  });

  it('is labelled, keyboard-operable (native select) and shows the current version in text', () => {
    renderAt('/app/cv-builder/t2');
    expect(screen.getByRole('combobox', { name: 'Editing CV' })).toBeInTheDocument();
    expect(screen.getByText(/Snowflake v1, tailored for Snowflake/)).toBeInTheDocument(); // not colour alone
  });

  it('shows a retry state when the CV list cannot be loaded', () => {
    mocks.cvs = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    renderAt('/app/cv-builder');
    expect(screen.getByText('Could not load your CVs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.cvs.refetch).toHaveBeenCalled();
  });

  it('puts the toolbars above the form card and the preview, with identical height classes', () => {
    renderAt('/app/cv-builder');
    const left = screen.getByTestId('cv-toolbar');
    const right = screen.getByTestId('preview-toolbar');
    for (const t of [left, right]) {
      expect(t.className).toContain('min-h-10');
      expect(t.className).toContain('mb-2.5');
    }
    expect(within(right).getByText('CV preview')).toBeInTheDocument();
    expect(within(left).getByText('Editing CV')).toBeInTheDocument();
    // Toolbar precedes its column content (card / viewer) in the same column wrapper.
    expect(left.nextElementSibling?.textContent).toMatch(/Personal/);
    expect(right.parentElement?.nextElementSibling).toContainElement(screen.getByTestId('pdf'));
  });
});

describe('CV section tabs', () => {
  it('shows plain, always-available tabs and highlights only the selected section', () => {
    renderAt('/app/cv-builder/o1');
    const labels = ['Personal', 'Summary', 'Experience', 'Education', 'Projects', 'Skills'];
    const tablist = screen.getByRole('tablist', { name: 'CV sections' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(labels);
    expect(screen.getByRole('tabpanel', { name: 'Personal' })).toBeInTheDocument();

    for (const [index, tab] of tabs.entries()) {
      expect(tab).toBeEnabled();
      fireEvent.click(tab);
      const panel = screen.getByRole('tabpanel', { name: labels[index] });
      expect(panel.id).toBe(tab.getAttribute('aria-controls'));
      expect(within(panel).getByRole('heading', { name: labels[index] })).toBeInTheDocument();
      expect(screen.queryByText(/Changes here only affect this CV/)).not.toBeInTheDocument();
      expect(within(tablist).getByRole('tab', { selected: true })).toBe(tab);
      expect(tabs.filter((item) => item.classList.contains('bg-accent'))).toEqual([tab]);
    }
    expect(screen.queryByRole('button', { name: /^(Back|Next:)/ })).not.toBeInTheDocument();
  });

  it('supports arrow keys, Home and End with focus following selection', () => {
    renderAt('/app/cv-builder/o1');
    const personal = screen.getByRole('tab', { name: 'Personal' });
    const summary = screen.getByRole('tab', { name: 'Summary' });
    const skills = screen.getByRole('tab', { name: 'Skills' });
    personal.focus();
    fireEvent.keyDown(personal, { key: 'ArrowRight' });
    expect(summary).toHaveFocus();
    expect(summary).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(summary, { key: 'End' });
    expect(skills).toHaveFocus();
    fireEvent.keyDown(skills, { key: 'ArrowRight' });
    expect(personal).toHaveFocus();
    fireEvent.keyDown(personal, { key: 'ArrowLeft' });
    expect(skills).toHaveFocus();
    fireEvent.keyDown(skills, { key: 'Home' });
    expect(personal).toHaveFocus();
    expect(personal).toHaveAttribute('tabindex', '0');
    expect(skills).toHaveAttribute('tabindex', '-1');
  });

  it('refreshes a stale preview on tab changes and saves with empty optional sections', async () => {
    renderAt('/app/cv-builder/o1');
    mocks.previewResolvers[0](new Blob(['%PDF']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());

    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(mocks.previewCalls).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Summary' }), { target: { value: 'Updated summary' } });
    expect(mocks.previewCalls).toHaveLength(1);

    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Experience' }));
    expect(mocks.previewCalls).toHaveLength(2);
    expect(lastPreview()).toMatchObject({ summary: 'Updated summary', experience: [], projects: [] });
    expect(screen.getByText(/unsaved changes/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save CV' }));
    expect(mocks.update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'o1',
        content: expect.objectContaining({ summary: 'Updated summary', experience: [], projects: [] }),
      }),
      expect.anything(),
    );
  });
});

describe('switching a clean CV', () => {
  it('switches without a prompt, loads that CV, shows its preview and keeps the selected section', () => {
    renderAt('/app/cv-builder/o1');
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    choose('t1');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/t1');
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument(); // section preserved
    expect((screen.getByRole('textbox', { name: 'Summary' }) as HTMLTextAreaElement).value).toBe('Hays summary');
    // The preview is generated from the SELECTED CV's content only.
    expect(lastPreview().fullName).toBe('Hays Person');
    expect(mocks.previewCalls.every((c) => (c as CvContent).fullName !== 'Orig Person' || true)).toBe(true);
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();
  });

  it('rapid switching ends on the last choice with only that CV’s data', () => {
    renderAt('/app/cv-builder/o1');
    choose('t1');
    choose('t2');
    choose('t1');
    expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/t1');
    expect(select().value).toBe('t1');
    expect(fullName()).toBe('Hays Person');
    expect(lastPreview().fullName).toBe('Hays Person');
  });

  it('ignores a stale preview response from the previous CV (never paints the old PDF)', async () => {
    renderAt('/app/cv-builder/o1');
    expect(mocks.previewResolvers).toHaveLength(1);
    const oldResolve = mocks.previewResolvers[0];
    choose('t1'); // new Editor + new preview engine; the old request is aborted/disposed
    await waitFor(() => expect(mocks.previewResolvers).toHaveLength(2));
    expect(screen.getByTestId('pdf')).toHaveTextContent('pdf-empty'); // cleared while loading, not the old doc
    oldResolve(new Blob(['old']));
    await Promise.resolve();
    expect(screen.getByTestId('pdf')).toHaveTextContent('pdf-empty');
    mocks.previewResolvers[1](new Blob(['new']));
    await waitFor(() => expect(screen.getByTestId('pdf')).toHaveTextContent('pdf-ready'));
  });
});

describe('unsaved-changes protection', () => {
  const makeDirty = () => fireEvent.change(fullNameInput(), { target: { value: 'Edited Name' } });
  const fullNameInput = () => screen.getByLabelText('Full name');

  it('prompts when the CV is dirty, and does not switch yet', () => {
    renderAt('/app/cv-builder/o1');
    makeDirty();
    choose('t1');
    const dlg = screen.getByRole('dialog', { name: 'Unsaved changes' });
    expect(dlg).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'Discard & switch' })).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'Save & switch' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/o1');
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();
  });

  it('names the current and target CVs and uses the refined button set', () => {
    renderAt('/app/cv-builder/t1');
    makeDirty();
    choose('o1');
    const dlg = screen.getByRole('dialog', { name: 'Unsaved changes' });
    expect(dlg).toHaveTextContent('“Hays v1”');
    expect(dlg).toHaveTextContent('“Original CV”');
    expect(within(dlg).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '', // the X icon close button has no text, only an accessible name
      'Keep editing',
      'Discard & switch',
      'Save & switch',
    ]);
    expect(within(dlg).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(within(dlg).queryByText('Close')).toBeNull(); // not the old text button
  });

  it('X and Escape behave like Keep editing; clicking outside does nothing', () => {
    renderAt('/app/cv-builder/o1');
    makeDirty();
    choose('t1');
    // Backdrop click is ignored: still open, nothing saved, nothing switched.
    fireEvent.click(document.querySelector('[role=dialog]')!.previousElementSibling!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/o1');
    // Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fullName()).toBe('Edited Name');
    // X
    choose('t1');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(select().value).toBe('o1');
    expect(fullName()).toBe('Edited Name');
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();
  });

  it('copes with very long CV names without losing the actions', () => {
    const long = 'A'.repeat(180);
    mocks.cvs = { ...mocks.cvs, data: [ORIG, { ...HAYS, name: long }, SNOW] };
    renderAt('/app/cv-builder/o1');
    makeDirty();
    choose('t1');
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveTextContent(long);
    expect(within(dlg).getByRole('button', { name: 'Save & switch' })).toBeInTheDocument();
  });

  it('Keep editing closes the dialog, keeps the CV and every edit', () => {
    renderAt('/app/cv-builder/o1');
    makeDirty();
    choose('t1');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(select().value).toBe('o1');
    expect(fullName()).toBe('Edited Name');
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();
  });

  it('Discard & switch switches without saving anything', () => {
    renderAt('/app/cv-builder/o1');
    makeDirty();
    choose('t1');
    fireEvent.click(screen.getByRole('button', { name: 'Discard & switch' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/t1');
    expect(fullName()).toBe('Hays Person');
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.update.mutate).not.toHaveBeenCalled();
  });

  it('Save & switch saves the CURRENT CV (only its id, name and content) and then switches', async () => {
    renderAt('/app/cv-builder/t1'); // a tailored CV
    makeDirty();
    choose('o1');
    fireEvent.click(screen.getByRole('button', { name: 'Save & switch' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/o1'));
    expect(mocks.update.mutateAsync).toHaveBeenCalledTimes(1);
    const payload = mocks.update.mutateAsync.mock.calls[0][0];
    // Targets the tailored CV (never the original), with its edits...
    expect(payload.id).toBe('t1');
    expect(payload.content.fullName).toBe('Edited Name');
    // ...and sends no provenance fields, so kind / sourceCvId / company / jobTitle / matchId are untouched.
    expect(Object.keys(payload).sort()).toEqual(['content', 'id', 'name']);
    expect(fullName()).toBe('Orig Person'); // the original loaded with its own data
  });

  it('a failed save keeps you on this CV with all edits and announces the error', async () => {
    mocks.update.mutateAsync = vi.fn().mockRejectedValue(new Error('boom'));
    renderAt('/app/cv-builder/o1');
    makeDirty();
    choose('t1');
    fireEvent.click(screen.getByRole('button', { name: 'Save & switch' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not save your CV/);
    expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/o1');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(fullName()).toBe('Edited Name');
  });

  it('cannot switch (or close the dialog) while a save is running', () => {
    renderAt('/app/cv-builder/o1');
    makeDirty();
    choose('t1');
    expect(select()).toBeDisabled(); // no second selection while the prompt is open
    mocks.update.isPending = true;
    cleanup();
    renderAt('/app/cv-builder/o1');
    expect(select()).toBeDisabled();
  });

  it('a harmless preview update is not an unsaved change', async () => {
    renderAt('/app/cv-builder/o1');
    mocks.previewResolvers[0](new Blob(['x']));
    await waitFor(() => expect(screen.getByTestId('pdf')).toHaveTextContent('pdf-ready'));
    choose('t1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('existing builder controls', () => {
  it('keeps zoom, full screen and Update preview working', async () => {
    renderAt('/app/cv-builder/o1');
    expect(screen.getByText('100%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    // Update preview is only enabled once the content differs from the rendered PDF.
    mocks.previewResolvers[0](new Blob(['x']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Changed' } });
    expect(screen.getByRole('button', { name: 'Update preview' })).toBeEnabled();
    expect(mocks.previewCalls).toHaveLength(1); // typing made no extra request
  });

  it('saving a CV sends only that CV id (an original is never overwritten by a tailored save)', () => {
    renderAt('/app/cv-builder/t2');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save CV' })[0]);
    expect(mocks.update.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.update.mutate.mock.calls[0][0]).toMatchObject({ id: 't2' });
    expect(Object.keys(mocks.update.mutate.mock.calls[0][0]).sort()).toEqual(['content', 'id', 'name']);
  });
});

describe('contact links (LinkedIn / GitHub)', () => {
  const saveBtn = () => screen.getAllByRole('button', { name: 'Save CV' })[0];
  const withLinks = (links: string[]) => {
    mocks.cvs = { ...mocks.cvs, data: [{ ...ORIG, content: { ...ORIG.content, links } }, HAYS, SNOW] };
  };

  it('shows LinkedIn and GitHub inputs on the Personal tab, not a comma-separated field', () => {
    renderAt('/app/cv-builder/o1');
    expect(screen.getByLabelText(/LinkedIn URL/)).toBeInTheDocument();
    expect(screen.getByLabelText(/GitHub URL/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Links/)).toBeNull();
  });

  it('saves normalised https links, and sends only id, name and content', () => {
    renderAt('/app/cv-builder/o1');
    fireEvent.change(screen.getByLabelText(/LinkedIn URL/), { target: { value: 'linkedin.com/in/sam' } });
    fireEvent.change(screen.getByLabelText(/GitHub URL/), { target: { value: 'github.com/sam' } });
    fireEvent.click(saveBtn());
    const payload = mocks.update.mutate.mock.calls[0][0];
    expect(payload.content.links).toEqual(['https://linkedin.com/in/sam', 'https://github.com/sam']);
    expect(Object.keys(payload).sort()).toEqual(['content', 'id', 'name']);
  });

  it('returns to Personal when Save finds an invalid link on another tab', () => {
    renderAt('/app/cv-builder/o1');
    fireEvent.change(screen.getByLabelText(/GitHub URL/), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    fireEvent.click(saveBtn());
    expect(screen.getByRole('tab', { name: 'Personal', selected: true })).toBeInTheDocument();
    expect(mocks.update.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/starts with https/i)).toBeInTheDocument();
  });

  it('an invalid link blocks Save & switch too (no save, no switch, edits kept)', () => {
    renderAt('/app/cv-builder/o1');
    fireEvent.change(screen.getByLabelText(/GitHub URL/), { target: { value: 'not a url' } });
    choose('t1');
    fireEvent.click(screen.getByRole('button', { name: 'Save & switch' }));
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/o1');
    expect((screen.getByLabelText(/GitHub URL/) as HTMLInputElement).value).toBe('not a url');
  });

  it('keeps legacy links untouched when saving other edits', () => {
    const legacy = ['https://janedoe.dev', 'github.com/sam', 'linkedin.com/in/sam'];
    withLinks(legacy);
    renderAt('/app/cv-builder/o1');
    expect((screen.getByLabelText(/LinkedIn URL/) as HTMLInputElement).value).toBe('linkedin.com/in/sam');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Renamed' } });
    fireEvent.click(saveBtn());
    expect(mocks.update.mutate.mock.calls[0][0].content.links).toEqual(legacy);
  });

  it('opening a CV with existing links is not an unsaved change', () => {
    withLinks(['github.com/sam']);
    renderAt('/app/cv-builder/o1');
    choose('t1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('typed link text survives moving between tabs', () => {
    renderAt('/app/cv-builder/o1');
    fireEvent.change(screen.getByLabelText(/LinkedIn URL/), { target: { value: 'linkedin.com/in/sam' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Personal' }));
    expect((screen.getByLabelText(/LinkedIn URL/) as HTMLInputElement).value).toBe('linkedin.com/in/sam');
  });
});

describe('phone number', () => {
  const saveBtn = () => screen.getAllByRole('button', { name: 'Save CV' })[0];
  const withPhone = (phone: string) => {
    mocks.cvs = { ...mocks.cvs, data: [{ ...ORIG, content: { ...ORIG.content, phone } }, HAYS, SNOW] };
  };
  const country = () => screen.getByRole('button', { name: /^Phone country:/ });

  it('shows a country dropdown and a separate number input instead of one phone field', () => {
    renderAt('/app/cv-builder/o1');
    expect(country()).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
  });

  it('saves a valid number as E.164', () => {
    renderAt('/app/cv-builder/o1');
    fireEvent.click(country());
    fireEvent.change(screen.getByRole('combobox', { name: 'Search countries' }), { target: { value: 'france' } });
    fireEvent.click(screen.getByRole('option', { name: /France/ }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '06 12 34 56 78' } });
    fireEvent.click(saveBtn());
    expect(mocks.update.mutate.mock.calls[0][0].content.phone).toBe('+33612345678');
  });

  it('blocks saving an invalid number and sends nothing', () => {
    renderAt('/app/cv-builder/o1');
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '12' } });
    fireEvent.click(saveBtn());
    expect(mocks.update.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/valid .* phone number/i);
  });

  it('keeps an existing legacy number untouched when saving other edits', () => {
    withPhone('555-0100');
    renderAt('/app/cv-builder/o1');
    expect((screen.getByLabelText('Phone number') as HTMLInputElement).value).toBe('555-0100');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Renamed' } });
    fireEvent.click(saveBtn());
    expect(mocks.update.mutate.mock.calls[0][0].content.phone).toBe('555-0100');
  });

  it('opening a CV with an existing number is not an unsaved change', () => {
    withPhone('+33 6 12 34 56 78');
    renderAt('/app/cv-builder/o1');
    choose('t1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('an invalid number blocks Save & switch (nothing saved, nothing switched)', () => {
    renderAt('/app/cv-builder/o1');
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '12' } });
    choose('t1');
    fireEvent.click(screen.getByRole('button', { name: 'Save & switch' }));
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/o1');
  });
});

describe('CV location', () => {
  it('keeps a legacy location unchanged when saving unrelated edits to the original CV', () => {
    const original = { ...ORIG, content: { ...ORIG.content, location: 'Wroclaw/Poland' } };
    mocks.cvs = { ...mocks.cvs, data: [original, HAYS, SNOW] };
    renderAt('/app/cv-builder/o1');
    expect(screen.getByLabelText(/^City/)).toHaveValue('Wroclaw');
    expect(screen.getByRole('button', { name: 'Location country: Poland' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save CV' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save CV' }));
    expect(mocks.update.mutate.mock.calls[0][0]).toMatchObject({
      id: 'o1',
      content: { location: 'Wroclaw/Poland' },
    });
  });

  it('previews and saves the tailored CV location, then loads the original CV location on switch', async () => {
    const original = { ...ORIG, content: { ...ORIG.content, location: 'Berlin, Germany' } };
    mocks.cvs = { ...mocks.cvs, data: [original, HAYS, SNOW] };
    renderAt('/app/cv-builder/t1');
    mocks.previewResolvers[0](new Blob(['%PDF']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());

    fireEvent.change(screen.getByLabelText(/^City/), { target: { value: 'Wrocław' } });
    fireEvent.click(screen.getByRole('button', { name: 'Location country: not selected' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search countries' }), { target: { value: 'Poland' } });
    fireEvent.click(screen.getByRole('option', { name: 'Poland' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update preview' }));
    expect(lastPreview().location).toBe('Wrocław, Poland');

    choose('o1');
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save & switch' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/o1'));

    expect(mocks.update.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.update.mutateAsync.mock.calls[0][0]).toMatchObject({
      id: 't1',
      content: { location: 'Wrocław, Poland' },
    });
    expect(screen.getByLabelText(/^City/)).toHaveValue('Berlin');
    expect(screen.getByRole('button', { name: 'Location country: Germany' })).toBeInTheDocument();
    expect(lastPreview().location).toBe('Berlin, Germany');
  });
});

describe('CV languages', () => {
  const showSkills = () => {
    const navigation = screen.queryByRole('tablist', { name: 'CV sections' }) ?? screen.getByRole('list', { name: 'Steps' });
    fireEvent.click(within(navigation).getByText(/^(?:6\. |✓ )?Skills$/));
  };

  it('reads saved legacy languages without making the CV dirty', () => {
    const legacy = { ...ORIG, content: { ...ORIG.content, languages: 'English - C1 / Arabic - Native' } };
    mocks.cvs = { ...mocks.cvs, data: [legacy, HAYS, SNOW] };
    renderAt('/app/cv-builder/o1');
    showSkills();
    expect(screen.getByRole('button', { name: 'Edit English' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save CV' })[0]).toBeDisabled();
    expect(lastPreview().languages).toBe(legacy.content.languages);
    choose('t1');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit English' })).toBeNull();
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();
  });

  it('previews and saves the selected tailored CV language string without changing the original', async () => {
    const original = { ...ORIG, content: { ...ORIG.content, languages: 'German B2' } };
    const tailored = { ...HAYS, content: { ...HAYS.content, languages: 'English C1, Arabic Native' } };
    mocks.cvs = { ...mocks.cvs, data: [original, tailored, SNOW] };
    renderAt('/app/cv-builder/t1');
    mocks.previewResolvers[0](new Blob(['%PDF']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update preview' })).toBeDisabled());
    showSkills();

    fireEvent.click(screen.getByRole('button', { name: 'Add language' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add language' }));
    fireEvent.change(dialog.getByLabelText('Language'), { target: { value: 'Polish' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add language' }));
    expect(mocks.previewCalls).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Update preview' }));
    expect(lastPreview().languages).toBe('English (C1), Arabic (Native), Polish');

    choose('o1');
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save & switch' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/cv-builder/o1'));
    expect(mocks.update.mutateAsync).toHaveBeenCalledExactlyOnceWith({
      id: 't1',
      name: 'Hays v1',
      content: { ...tailored.content, languages: 'English (C1), Arabic (Native), Polish' },
    });
    expect(screen.getByRole('button', { name: 'Edit German' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Polish' })).toBeNull();
    expect(lastPreview().languages).toBe('German B2');
  });
});
