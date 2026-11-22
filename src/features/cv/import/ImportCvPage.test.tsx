import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CvImportResult } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';
import ImportCvPage from './ImportCvPage';

// The real page, API client and React Query hooks; only fetch (the FlowJob API) and the PDF canvas are replaced.
vi.mock('../HarvardPdfViewer', () => ({
  HarvardPdfViewer: ({ blob }: { blob: Blob | null }) => <div data-testid="pdf">{blob ? 'pdf-ready' : 'pdf-empty'}</div>,
}));

const RESULT: CvImportResult = {
  content: {
    fullName: 'Ada Example', email: 'ada@example.com', phone: '', location: '', links: [],
    summary: 'Backend developer who builds reliable APIs.',
    experience: [
      { id: 'import-experience-1', title: 'Software Engineer', company: 'Acme Ltd', location: '', start: '2021-01',
        end: '', bullets: ['Built REST APIs'] },
      { id: 'import-experience-2', title: 'Junior Developer', company: 'Beta Systems', location: '', start: '',
        end: '', bullets: [] },
    ],
    education: [], projects: [], skills: ['Python', 'FastAPI'], languages: '',
  },
  warnings: [
    { field: 'skills[2]', value: 'Kubernetes', reason: 'not_in_cv', message: 'Not found in your CV, so it was left out.' },
    { field: 'experience[1].start', value: 'Jan 2021', reason: 'date_not_near_entry',
      message: 'This date was not found next to this entry in your CV, so it was left out.' },
  ],
  missing: ['phone', 'location', 'education'],
  source: { pages: 1, method: 'pdf-text' },
  model: 'gpt-4.1',
};

type Handler = (path: string, init: RequestInit) => Response | Promise<Response> | undefined;
let requests: Array<{ path: string; method: string; init: RequestInit }>;

function stubApi(handler: Handler) {
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, 'https://fixture.test').pathname.replace(/^\/api\/v1/, '');
    requests.push({ path, method: init.method ?? 'GET', init });
    const response = await handler(path, init);
    if (response) return response;
    if (path === '/cvs/preview/pdf') return new Response(new Blob(['%PDF-preview']), { status: 200 });
    if (path === '/cvs' && init.method === 'GET') return Response.json([]);
    throw new Error(`Unexpected request ${init.method} ${path}`);
  }));
}

function pdfFile(name = 'cv.pdf', body: BlobPart = '%PDF-1.7\nsynthetic test CV', type = 'application/pdf') {
  return new File([body], name, { type });
}

function Builder() {
  return <p>BUILDER {useParams().cvId}</p>;
}

function renderPage() {
  const router = createMemoryRouter([
    { path: '/app/cvs/import', element: <ImportCvPage /> },
    { path: '/app/cvs', element: <p>MY CVS</p> },
    { path: '/app/cv-builder', element: <p>BUILDER</p> },
    { path: '/app/cv-builder/:cvId', element: <Builder /> },
  ], { initialEntries: ['/app/cvs/import'] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

const fileInput = () => screen.getByLabelText('CV PDF file');
const importButton = () => screen.getByRole('button', { name: 'Import CV' });
const consentBox = () => screen.getByRole('checkbox', { name: /sent to OpenAI/ });

async function chooseAndImport(file = pdfFile()) {
  fireEvent.change(fileInput(), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(file.name)).toBeVisible());
  fireEvent.click(consentBox());
  fireEvent.click(importButton());
}

async function reachReview() {
  stubApi((path) => (path === '/cvs/import' ? Response.json(RESULT) : undefined));
  const router = renderPage();
  await chooseAndImport();
  expect(await screen.findByRole('heading', { name: 'Review your imported CV' })).toBeVisible();
  return router;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('choosing a file', () => {
  it.each([
    ['a non-PDF file', pdfFile('cv.docx', 'PK\x03\x04', 'application/vnd.openxmlformats'), 'Choose a PDF file.'],
    ['an empty file', pdfFile('cv.pdf', ''), 'This file is empty.'],
    ['a file over 5 MB', pdfFile('cv.pdf', new Uint8Array(5 * 1024 * 1024 + 1)), 'larger than 5 MB'],
    ['a renamed non-PDF', pdfFile('photo.pdf', '\x89PNG\r\n'), 'not a PDF'],
  ])('rejects %s before anything is uploaded', async (_label, file, message) => {
    stubApi(() => undefined);
    renderPage();
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    fireEvent.click(consentBox());
    expect(importButton()).toBeDisabled();
    expect(requests).toEqual([]);
  });

  it('accepts a PDF whose header follows a byte-order mark', async () => {
    stubApi(() => undefined);
    renderPage();
    fireEvent.change(fileInput(), { target: { files: [pdfFile('cv.pdf', '﻿%PDF-1.4 text')] } });
    expect(await screen.findByText('cv.pdf')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('consent', () => {
  it('explains OpenAI processing and sends nothing until the user agrees', async () => {
    stubApi((path) => (path === '/cvs/import' ? Response.json(RESULT) : undefined));
    renderPage();
    expect(screen.getByText(/The extracted text is sent to OpenAI/)).toBeVisible();
    expect(screen.getByText(/does not keep your PDF or its text/)).toBeVisible();
    const file = pdfFile();
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await screen.findByText('cv.pdf');
    expect(importButton()).toBeDisabled();
    expect(requests).toEqual([]);

    fireEvent.click(consentBox());
    fireEvent.click(importButton());
    await screen.findByRole('heading', { name: 'Review your imported CV' });
    const call = requests.find((r) => r.path === '/cvs/import')!;
    const headers = new Headers(call.init.headers);
    expect(call.method).toBe('POST');
    expect(headers.get('Content-Type')).toBe('application/pdf');
    expect(headers.get('X-FlowJob-AI-Consent')).toBe('cv-import');
    expect(call.init.body).toBe(file);
  });
});

describe('progress and errors', () => {
  it('shows progress and can cancel without leaving the page', async () => {
    let release!: (r: Response) => void;
    stubApi((path, init) => (path === '/cvs/import' ? new Promise<Response>((resolve, reject) => {
      release = resolve;
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }) : undefined));
    renderPage();
    await chooseAndImport();
    expect(await screen.findByText('Reading your PDF and organizing it…')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/Import cancelled/)).toBeVisible();
    expect(screen.getByLabelText('CV PDF file')).toBeInTheDocument();
    release?.(Response.json(RESULT));
    expect(screen.queryByRole('heading', { name: 'Review your imported CV' })).not.toBeInTheDocument();
  });

  it.each([
    [413, { detail: 'The PDF is too large. The limit is 5 MB.' }, 'This PDF is too large', 'limit is 5 MB'],
    [422, { detail: 'This PDF has no selectable text, so it looks like a scanned image. Scanned CVs are not supported yet: create your CV step by step instead.' },
      'This looks like a scanned CV', 'Scanned CVs are not supported yet'],
    [422, { detail: 'This PDF is password-protected. Upload a version without a password.' },
      'This PDF is password-protected', 'without a password'],
    [429, { detail: 'Daily CV import limit reached. Please try again tomorrow.' }, 'Daily import limit reached',
      'You can still create your CV manually'],
    [503, { detail: 'The AI service is not configured yet.' }, 'Import is unavailable right now', 'not configured'],
    [502, { detail: 'The AI service returned an unusable result.' }, 'The CV could not be organized', 'unusable result'],
  ])('explains a %i response', async (status, body, title, text) => {
    stubApi((path) => (path === '/cvs/import' ? Response.json(body, { status }) : undefined));
    renderPage();
    await chooseAndImport();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(title);
    expect(alert).toHaveTextContent(text);
    expect(within(alert).getByRole('link', { name: 'Create your CV manually instead' })).toHaveAttribute('href', '/app/cv-builder');
    expect(requests.filter((r) => r.path === '/cvs')).toEqual([]);
  });

  it('explains an unreachable server', async () => {
    stubApi((path) => {
      if (path === '/cvs/import') throw new TypeError('Failed to fetch');
      return undefined;
    });
    renderPage();
    await chooseAndImport();
    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach the FlowJob server');
  });
});

describe('review', () => {
  it('shows what was found, what was left out, and what is missing, without filling anything in', async () => {
    await reachReview();
    expect(screen.getByText(/Found 2 jobs, 0 education entries, 0 projects, 2 skills/)).toBeVisible();
    expect(screen.getByText(/2 items were left out/)).toBeVisible();
    expect(screen.getByText(/Not found in your CV: Phone, Location, Education/)).toBeVisible();
    expect(screen.getByLabelText('Full name')).toHaveValue('Ada Example');
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
    expect(screen.getByText(/Phone and Location not found in your CV/)).toBeVisible();
    expect(screen.getByTestId('pdf')).toBeInTheDocument(); // the existing Harvard preview

    fireEvent.click(screen.getByRole('tab', { name: /Experience/ }));
    expect(screen.getByText('Start date not found in your CV')).toBeVisible();
    const notes = screen.getByTestId('import-notes');
    expect(notes).toHaveTextContent('Job 2 in your CV: start date: “Jan 2021”');
    expect(notes).toHaveTextContent('Found in your CV, but not where it belongs.');

    fireEvent.click(screen.getByRole('tab', { name: /Skills/ }));
    const skillNotes = screen.getByTestId('import-notes');
    expect(skillNotes).toHaveTextContent('Skill: “Kubernetes”');
    expect(screen.getAllByText(/Python|FastAPI/).length).toBeGreaterThan(0);
    // The left-out skill appears only in the notes, never as a skill in the editor.
    expect(screen.getAllByText(/Kubernetes/).every((element) => skillNotes.contains(element))).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: /Education/ }));
    expect(screen.getByText('Nothing found in your CV for this section.')).toBeVisible();
  });

  it('saves a new CV with the edits, only after the user confirms', async () => {
    stubApi((path, init) => {
      if (path === '/cvs/import') return Response.json(RESULT);
      if (path === '/cvs' && init.method === 'POST') {
        return Response.json({ id: 'new-cv', name: 'x', kind: 'original', createdAt: '', updatedAt: '', content: RESULT.content },
          { status: 201 });
      }
      return undefined;
    });
    const router = renderPage();
    await chooseAndImport();
    await screen.findByRole('heading', { name: 'Review your imported CV' });

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada M. Example' } });
    fireEvent.change(screen.getByLabelText('CV name'), { target: { value: 'My imported CV' } });
    const save = screen.getByRole('button', { name: 'Save as new CV' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(requests.filter((r) => r.path === '/cvs' && r.method === 'POST')).toEqual([]);

    fireEvent.click(screen.getByRole('checkbox', { name: /reviewed this information and it is accurate/ }));
    fireEvent.click(save);
    expect(await screen.findByText('BUILDER new-cv')).toBeVisible();
    expect(router.state.location.pathname).toBe('/app/cv-builder/new-cv');
    const posts = requests.filter((r) => r.path === '/cvs' && r.method === 'POST');
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0].init.body as string);
    expect(body).toMatchObject({ name: 'My imported CV', kind: 'original' });
    expect(body.content.fullName).toBe('Ada M. Example');
    expect(body.content.skills).toEqual(['Python', 'FastAPI']);
    expect(body.content.experience[1].start).toBe(''); // never filled in
    expect(body.content.phone).toBe('');
  });

  it('keeps the review open when saving fails', async () => {
    stubApi((path, init) => {
      if (path === '/cvs/import') return Response.json(RESULT);
      if (path === '/cvs' && init.method === 'POST') return Response.json({ detail: 'Could not save.' }, { status: 503 });
      return undefined;
    });
    renderPage();
    await chooseAndImport();
    await screen.findByRole('heading', { name: 'Review your imported CV' });
    fireEvent.click(screen.getByRole('checkbox', { name: /reviewed this information/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as new CV' }));
    expect(await screen.findByText('Could not save.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Review your imported CV' })).toBeVisible();
    expect(screen.getByLabelText('Full name')).toHaveValue('Ada Example');
  });

  it('discards the import without saving anything', async () => {
    const router = await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Discard import' }));
    const dialog = screen.getByRole('dialog', { name: 'Discard this import?' });
    expect(dialog).toHaveTextContent('Nothing has been saved.');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Discard import' }));
    });
    expect(await screen.findByText('MY CVS')).toBeVisible();
    expect(router.state.location.pathname).toBe('/app/cvs');
    expect(requests.filter((r) => r.method !== 'GET' && r.path !== '/cvs/import' && r.path !== '/cvs/preview/pdf')).toEqual([]);
  });

  it('keeps the file and the extracted CV out of browser storage', async () => {
    await reachReview();
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    for (const text of ['Ada Example', 'ada@example.com', 'Acme Ltd', 'Kubernetes', 'synthetic test CV']) {
      expect(stored).not.toContain(text);
    }
  });
});
