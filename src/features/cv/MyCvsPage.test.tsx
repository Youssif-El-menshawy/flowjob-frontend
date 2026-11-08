import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cv, CvContent } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';
import MyCvsPage from './MyCvsPage';

const mocks = vi.hoisted(() => ({ api: vi.fn(), pdf: vi.fn(), download: vi.fn() }));
vi.mock('@/shared/api/client', () => ({ api: mocks.api, apiBlob: mocks.pdf }));
vi.mock('@/shared/lib/utils', async (original) => ({
  ...await original<typeof import('@/shared/lib/utils')>(),
  downloadBlob: mocks.download,
}));
vi.mock('./HarvardPdfViewer', () => ({
  HarvardPdfViewer: ({ blob, scale, status, errorText, onDocumentError }: {
    blob: Blob | null;
    scale: number;
    status: string;
    errorText: string;
    onDocumentError?: () => void;
  }) => (
    <>
      <div data-testid="pdf">{blob ? `${blob.type} @ ${scale}` : 'empty'}</div>
      {status === 'error' && <p role="alert">{errorText}</p>}
      {blob && <button onClick={onDocumentError}>Simulate PDF error</button>}
    </>
  ),
}));

const original: Cv = {
  id: 'o1', name: 'Original CV', kind: 'original', createdAt: '2026-01-01', updatedAt: '2026-01-02',
  content: {} as CvContent,
};
const alpha: Cv = {
  ...original, id: 't1', name: 'Alpha', kind: 'tailored', company: 'Hays',
  jobTitle: 'Backend Engineer', createdAt: '2026-03-01', updatedAt: '2026-03-02',
};
const zeta: Cv = {
  ...original, id: 't2', name: 'Zeta', kind: 'tailored', company: 'Snowflake',
  jobTitle: 'Product Designer', createdAt: '2026-02-01', updatedAt: '2026-04-02',
};
let cvs: Cv[];
let client: QueryClient;

const blob = (id: string) => new Blob([id], { type: id });
const pdf = () => screen.getByTestId('pdf');
const list = () => screen.getByRole('list', { name: 'Saved CVs' });
const row = (name: string) => within(list()).getByRole('button', { name: new RegExp(name) });
const preview = () => screen.getByRole('region', { name: 'Selected CV preview' });
const selectedHeading = (name: string) => within(preview()).getByRole('heading', { name });
const select = (name: string) => fireEvent.click(row(name));
const search = (value: string) => fireEvent.change(screen.getByRole('searchbox', { name: 'Search CVs' }), { target: { value } });
const sort = (value: string) => fireEvent.change(screen.getByLabelText('Sort by'), { target: { value } });

function BuilderTarget() {
  return <h1>Editing CV {useParams().cvId}</h1>;
}
function renderPage(desktop = true) {
  vi.stubGlobal('matchMedia', () => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  render(
    <MemoryRouter initialEntries={['/app/cvs']}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <Routes>
            <Route path="/app/cvs" element={<MyCvsPage />} />
            <Route path="/app/cv-builder/:cvId" element={<BuilderTarget />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function openActions() {
  const trigger = screen.getByLabelText('More CV actions');
  // jsdom does not perform the native summary click default action synchronously.
  (trigger.parentElement as HTMLDetailsElement).open = true;
}

beforeEach(() => {
  cvs = [alpha, original, zeta];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.pdf.mockImplementation((url: string) => Promise.resolve(blob(url.split('/')[2])));
  mocks.api.mockImplementation(async (url: string, init?: { method?: string; json?: { name: string } }) => {
    if (url === '/cvs') return cvs;
    if (url === '/applications') return [{ id: 'a1', cvId: 't1' }, { id: 'a2', cvId: 't2' }];
    if (init?.method === 'DELETE') {
      cvs = cvs.filter((cv) => `/cvs/${cv.id}` !== url);
      return;
    }
    if (init?.method === 'PUT') {
      const saved = cvs.find((cv) => `/cvs/${cv.id}` === url)!;
      const renamed = { ...saved, name: init.json!.name, updatedAt: '2026-05-01' };
      cvs = cvs.map((cv) => cv.id === renamed.id ? renamed : cv);
      return renamed;
    }
    throw new Error(`Unexpected API call: ${url}`);
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('CV library', () => {
  it('pins and previews the original by default and only reads the selected PDF', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'CV Library' });
    expect(row('Original CV')).toHaveAttribute('aria-current', 'true');
    expect(selectedHeading('Original CV')).toBeInTheDocument();
    expect(screen.getByText('2 tailored CVs')).toBeInTheDocument();
    await waitFor(() => expect(pdf()).toHaveTextContent('o1 @ 1'));
    expect(mocks.api.mock.calls).toEqual([['/cvs']]);
    expect(mocks.pdf.mock.calls.map(([url]) => url)).toEqual(['/cvs/o1/pdf']);
  });

  it('defaults to the most recently updated tailored CV when no original exists', async () => {
    cvs = [alpha, zeta];
    renderPage();
    await screen.findByRole('heading', { name: 'Zeta' });
    expect(row('Zeta')).toHaveAttribute('aria-current', 'true');
    sort('created');
    expect(selectedHeading('Zeta')).toBeInTheDocument();
  });

  it('provides a creation link for an empty library and does not request a PDF', async () => {
    cvs = [];
    renderPage();
    expect(await screen.findByRole('link', { name: 'Create CV' })).toHaveAttribute('href', '/app/cv-builder');
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it('shows a library error and retries the list request', async () => {
    mocks.api.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry library' }));
    expect(await screen.findByRole('heading', { name: 'Original CV' })).toBeInTheDocument();
  });

  it('matches name, company and job title case insensitively, and previews only visible results', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Original CV' });
    for (const query of ['aLpHa', 'hAYS', 'BACKEND engineer']) {
      search(query);
      expect(within(list()).getAllByRole('button')).toEqual([row('Alpha')]);
      expect(selectedHeading('Alpha')).toBeInTheDocument();
    }
    search('not in library');
    expect(screen.getByText('No CVs match your search.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected CV preview' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(selectedHeading('Original CV')).toBeInTheDocument();
  });

  it('sorts by updated, created, and name while keeping the original first', async () => {
    cvs.push({ ...zeta, id: 't3', name: 'Middle', createdAt: '2026-05-01', updatedAt: '2026-05-02' });
    renderPage();
    await screen.findByRole('heading', { name: 'Original CV' });
    const rows = () => within(list()).getAllByRole('button');
    expect(rows()).toEqual([row('Original CV'), row('Middle'), row('Zeta'), row('Alpha')]);
    sort('created');
    expect(rows()).toEqual([row('Original CV'), row('Middle'), row('Alpha'), row('Zeta')]);
    sort('name');
    expect(rows()).toEqual([row('Original CV'), row('Alpha'), row('Middle'), row('Zeta')]);
    expect(row('Original CV')).toHaveAttribute('aria-current', 'true');
  });

  it('aborts abandoned previews and ignores late responses during rapid switching', async () => {
    const finish = new Map<string, (value: Blob) => void>();
    mocks.pdf.mockImplementation((url: string) => new Promise<Blob>((resolve) => finish.set(url, resolve)));
    renderPage();
    await screen.findByRole('heading', { name: 'Original CV' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading PDF for Original CV');
    select('Alpha');
    const abandoned = mocks.pdf.mock.calls.find(([url]) => url === '/cvs/t1/pdf')?.[1]?.signal as AbortSignal;
    select('Zeta');
    expect(selectedHeading('Zeta')).toBeInTheDocument();
    expect(pdf()).toHaveTextContent('empty');
    expect(abandoned.aborted).toBe(true);
    await act(async () => finish.get('/cvs/t2/pdf')!(blob('t2')));
    await waitFor(() => expect(pdf()).toHaveTextContent('t2 @ 1'));
    await act(async () => {
      finish.get('/cvs/o1/pdf')!(blob('o1'));
      finish.get('/cvs/t1/pdf')!(blob('t1'));
    });
    expect(pdf()).toHaveTextContent('t2 @ 1');
  });

  it('retries an unavailable PDF and handles document rendering failures', async () => {
    mocks.pdf.mockRejectedValueOnce(new Error('404'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load/);
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry PDF' }));
    await waitFor(() => expect(pdf()).toHaveTextContent('o1 @ 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Simulate PDF error' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load/);
    expect(pdf()).toHaveTextContent('empty');
  });

  it('keeps zoom across full screen and downloads and edits the selected CV by ID', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Original CV' });
    select('Alpha');
    await waitFor(() => expect(pdf()).toHaveTextContent('t1 @ 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    const dialog = screen.getByRole('dialog', { name: 'Alpha' });
    expect(within(dialog).getByTestId('pdf')).toHaveTextContent('t1 @ 1.25');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download PDF' }));
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ type: 't1' }), 'Alpha.pdf');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Exit full screen' }));
    expect(pdf()).toHaveTextContent('t1 @ 1.25');
    expect(mocks.pdf.mock.calls.map(([url]) => url)).toEqual(['/cvs/o1/pdf', '/cvs/t1/pdf']);
    expect(screen.getByRole('link', { name: 'Edit CV' })).toHaveAttribute('href', '/app/cv-builder/t1');
    fireEvent.click(screen.getByRole('link', { name: 'Edit CV' }));
    expect(screen.getByRole('heading', { name: 'Editing CV t1' })).toBeInTheDocument();
  });

  it('renames only the selected CV name through the existing update endpoint', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Original CV' });
    openActions();
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename CV' });
    fireEvent.change(within(dialog).getByLabelText('CV name'), { target: { value: ' Master CV ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('heading', { name: 'Master CV' })).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith('/cvs/o1', { method: 'PUT', json: { name: 'Master CV' } });
  });

  it('confirms tailored deletion with actual application links and returns to the original', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Original CV' });
    openActions();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    select('Alpha');
    openActions();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Alpha?' });
    expect(await within(dialog).findByText(/1 application uses this CV/)).toHaveTextContent(/Applications are kept/);
    expect(mocks.api).not.toHaveBeenCalledWith('/cvs/t1', { method: 'DELETE' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(selectedHeading('Original CV')).toBeInTheDocument());
    expect(within(list()).queryByRole('button', { name: /Alpha/ })).toBeNull();
    expect(mocks.api).toHaveBeenCalledWith('/cvs/t1', { method: 'DELETE' });
  });

  it('shows the list first on mobile, then opens and closes a full-screen detail', async () => {
    renderPage(false);
    await screen.findByRole('heading', { name: 'CV Library' });
    expect(mocks.pdf).not.toHaveBeenCalled();
    select('Alpha');
    const dialog = screen.getByRole('dialog', { name: 'Alpha' });
    expect(within(dialog).getByRole('link', { name: 'Edit CV' })).toHaveAttribute('href', '/app/cv-builder/t1');
    await waitFor(() => expect(within(dialog).getByTestId('pdf')).toHaveTextContent('t1 @ 1'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to library' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(list()).toBeInTheDocument();
    expect(mocks.pdf.mock.calls.map(([url]) => url)).toEqual(['/cvs/t1/pdf']);
  });
});
