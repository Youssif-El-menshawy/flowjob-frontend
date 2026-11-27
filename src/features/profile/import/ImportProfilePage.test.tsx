import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CvImportResult, Profile, ProfileImportStatus } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';
import { guardedRouter, unload } from '@/test/guardedRouter';
import ImportProfilePage from './ImportProfilePage';

// The real page, API client and React Query hooks; only fetch (the FlowJob API) and the PDF canvas are replaced.
vi.mock('@/features/cv/HarvardPdfViewer', () => ({
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

/** A new account's Profile: only the account's name and email. */
const BLANK: Profile = {
  fullName: 'Ana Nowak', email: 'ana@example.com', phone: '', location: '', links: [], summary: '',
  experience: [], education: [], projects: [], skills: [], languages: '',
};
const REVISION = 'a'.repeat(64);
const status = (over: Partial<ProfileImportStatus> = {}): ProfileImportStatus => ({
  available: true, importedAt: null, profile: BLANK, revision: REVISION, ...over,
});

type Handler = (path: string, init: RequestInit) => Response | Promise<Response> | undefined;
let requests: Array<{ path: string; method: string; init: RequestInit }>;
let currentStatus: ProfileImportStatus;

function stubApi(handler: Handler = () => undefined) {
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, 'https://fixture.test').pathname.replace(/^\/api\/v1/, '');
    requests.push({ path, method: init.method ?? 'GET', init });
    const response = await handler(path, init);
    if (response) return response;
    if (path === '/profile/import' && (init.method ?? 'GET') === 'GET') return Response.json(currentStatus);
    if (path === '/profile/import/pdf') return Response.json(RESULT);
    if (path === '/cvs/preview/pdf') return new Response(new Blob(['%PDF-preview']), { status: 200 });
    throw new Error(`Unexpected request ${init.method} ${path}`);
  }));
}

const saves = () => requests.filter((r) => r.path === '/profile/import' && r.method === 'POST');
const saveBody = (index = 0) => JSON.parse(saves()[index].init.body as string);

function pdfFile(name = 'cv.pdf', body: BlobPart = '%PDF-1.7\nsynthetic test CV', type = 'application/pdf') {
  return new File([body], name, { type });
}

function Dashboard() {
  const state = useLocation().state as { profileImported?: boolean } | null;
  return <p>DASHBOARD {state?.profileImported ? 'after import' : ''}</p>;
}

function renderPage() {
  // With the app's interruption guard, as in the real routes. The link stands in for the sidebar.
  const router = guardedRouter([
    { path: '/app/profile/import', element: <><Link to="/app/cvs">Sidebar: My CVs</Link><ImportProfilePage /></> },
    { path: '/app/profile', element: <p>PROFILE</p> },
    { path: '/app/cvs', element: <p>MY CVS</p> },
    { path: '/app', element: <Dashboard /> },
  ], ['/app/profile/import']);
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
const consentBox = () => screen.getByRole('checkbox', { name: /sent to an AI service/ });
const confirmBox = () => screen.getByRole('checkbox', { name: /reviewed this information and it is accurate/ });
const saveButton = () => screen.getByRole('button', { name: 'Save to my Profile' });
const summaryBox = () => screen.getByRole('textbox', { name: 'Summary' });

async function chooseAndImport(file = pdfFile()) {
  fireEvent.change(await screen.findByLabelText('CV PDF file'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(file.name)).toBeVisible());
  fireEvent.click(consentBox());
  fireEvent.click(importButton());
}

async function reachReview(handler?: Handler) {
  stubApi(handler);
  const router = renderPage();
  await chooseAndImport();
  expect(await screen.findByRole('heading', { name: 'Review your Profile' })).toBeVisible();
  return router;
}

async function confirmAndSave() {
  fireEvent.click(confirmBox());
  fireEvent.click(saveButton());
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  currentStatus = status();
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
    stubApi();
    renderPage();
    fireEvent.change(await screen.findByLabelText('CV PDF file'), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    fireEvent.click(consentBox());
    expect(importButton()).toBeDisabled();
    expect(requests.filter((r) => r.path !== '/profile/import')).toEqual([]);
  });

  it('accepts a PDF whose header follows a byte-order mark', async () => {
    stubApi();
    renderPage();
    fireEvent.change(await screen.findByLabelText('CV PDF file'), { target: { files: [pdfFile('cv.pdf', '﻿%PDF-1.4 text')] } });
    expect(await screen.findByText('cv.pdf')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('availability', () => {
  it('explains that the CV was already imported and offers the Profile instead', async () => {
    currentStatus = status({ available: false, importedAt: '2026-11-20T10:00:00Z' });
    stubApi();
    renderPage();
    expect(await screen.findByText('Your CV is already imported')).toBeVisible();
    expect(screen.getByText(/Each account can do this once, and you can keep editing your Profile/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to my Profile' })).toHaveAttribute('href', '/app/profile');
    expect(screen.queryByLabelText('CV PDF file')).not.toBeInTheDocument();
  });

  it('explains when the availability cannot be checked', async () => {
    stubApi((path) => (path === '/profile/import' ? Response.json({ detail: 'Down' }, { status: 500 }) : undefined));
    renderPage();
    expect(await screen.findByText('Could not check your Profile')).toBeVisible();
  });
});

describe('consent', () => {
  it('explains the AI processing and the one-time import, and sends nothing until the user agrees', async () => {
    stubApi();
    renderPage();
    expect(await screen.findByText(/The text of your CV is sent to an external AI service/)).toBeVisible();
    expect(screen.getByText(/may be outside the EU/)).toBeVisible();
    expect(screen.getByText(/doesn’t keep your PDF or its text/)).toBeVisible();
    expect(screen.queryByText(/OpenAI/)).toBeNull();
    expect(screen.getByText(/Each account can import a CV once/)).toBeVisible();
    const file = pdfFile();
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await screen.findByText('cv.pdf');
    expect(importButton()).toBeDisabled();
    expect(requests.filter((r) => r.path === '/profile/import/pdf')).toEqual([]);

    fireEvent.click(consentBox());
    fireEvent.click(importButton());
    await screen.findByRole('heading', { name: 'Review your Profile' });
    const call = requests.find((r) => r.path === '/profile/import/pdf')!;
    const headers = new Headers(call.init.headers);
    expect(call.method).toBe('POST');
    expect(headers.get('Content-Type')).toBe('application/pdf');
    expect(headers.get('X-FlowJob-AI-Consent')).toBe('cv-import');
    expect(call.init.body).toBe(file);
  });
});

describe('progress and errors', () => {
  /** Holds the extraction open until the test releases it (or the page aborts it). */
  function holdImport() {
    const held: { release: (response: Response) => void } = { release: () => {} };
    stubApi((path, init) => (path === '/profile/import/pdf' ? new Promise<Response>((resolve, reject) => {
      held.release = resolve;
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }) : undefined));
    return held;
  }
  const extractions = () => requests.filter((r) => r.path === '/profile/import/pdf');
  const busyButton = (name: string) => screen.getByRole('button', { name });

  it('keeps the form on screen and shows the progress inside the Import CV button', async () => {
    holdImport();
    renderPage();
    await chooseAndImport();
    const button = await screen.findByRole('button', { name: 'Reading your CV…' });
    expect(button).toBeDisabled();
    expect(button.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.getByRole('heading', { name: '1. Choose your CV' })).toBeVisible();
    expect(screen.getByText('cv.pdf')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Reading your CV…');
    expect(screen.getByRole('status')).not.toHaveTextContent('%');
  });

  it('rotates informational messages without inventing progress', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      holdImport();
      renderPage();
      await chooseAndImport();
      expect(await screen.findByRole('button', { name: 'Reading your CV…' })).toBeDisabled();
      act(() => vi.advanceTimersByTime(5000));
      expect(busyButton('Organizing your information…')).toBeDisabled();
      act(() => vi.advanceTimersByTime(5000));
      expect(busyButton('Preparing your review…')).toBeDisabled();
      for (let i = 0; i < 6; i += 1) { // it stays on the last message instead of starting over
        act(() => vi.advanceTimersByTime(5000));
        expect(busyButton('Preparing your review…')).toHaveTextContent(/^Preparing your review…$/);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks a second file or a duplicate import while processing', async () => {
    holdImport();
    renderPage();
    await chooseAndImport();
    const button = await screen.findByRole('button', { name: 'Reading your CV…' });
    expect(fileInput()).toBeDisabled();
    expect(consentBox()).toBeDisabled();
    fireEvent.click(button);
    fireEvent.change(fileInput(), { target: { files: [pdfFile('other.pdf')] } });
    fireEvent.drop(screen.getByText('cv.pdf'), { dataTransfer: { files: [pdfFile('dropped.pdf')] } });
    await act(async () => {});
    expect(extractions()).toHaveLength(1);
    expect(screen.getByText('cv.pdf')).toBeVisible();
    expect(screen.queryByText('other.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('dropped.pdf')).not.toBeInTheDocument();
  });

  it('can cancel without using up the import, keeping the chosen file', async () => {
    const held = holdImport();
    renderPage();
    await chooseAndImport();
    await screen.findByRole('button', { name: 'Reading your CV…' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/Import cancelled. Your Profile was not changed, and you can still import/)).toBeVisible();
    expect(extractions()[0].init.signal?.aborted).toBe(true);
    expect(importButton()).toBeEnabled();
    expect(screen.getByText('cv.pdf')).toBeVisible();
    expect(fileInput()).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/app/profile');
    held.release(Response.json(RESULT));
    await act(async () => {});
    expect(screen.queryByRole('heading', { name: 'Review your Profile' })).not.toBeInTheDocument();
    expect(saves()).toEqual([]);
  });

  it('restores the button after a failure and keeps the file for another try', async () => {
    let calls = 0;
    stubApi((path) => {
      if (path !== '/profile/import/pdf') return undefined;
      calls += 1;
      return calls === 1 ? Response.json({ detail: 'The AI service returned an unusable result.' }, { status: 502 }) : undefined;
    });
    renderPage();
    const file = pdfFile();
    await chooseAndImport(file);
    expect(await screen.findByRole('alert')).toHaveTextContent('The CV could not be organized');
    expect(importButton()).toBeEnabled();
    expect(screen.getByText('cv.pdf')).toBeVisible();
    expect(consentBox()).toBeChecked();
    fireEvent.click(importButton());
    expect(await screen.findByRole('heading', { name: 'Review your Profile' })).toBeVisible();
    expect(extractions()).toHaveLength(2);
    expect(extractions()[1].init.body).toBe(file);
    expect(new Headers(extractions()[1].init.headers).get('X-FlowJob-AI-Consent')).toBe('cv-import');
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
    [409, { detail: 'Your CV has already been imported into your Profile.' }, 'Your CV is already imported', 'already been imported'],
  ])('explains a %i response', async (code, body, title, text) => {
    stubApi((path) => (path === '/profile/import/pdf' ? Response.json(body, { status: code }) : undefined));
    renderPage();
    await chooseAndImport();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(title);
    expect(alert).toHaveTextContent(text);
    expect(within(alert).getByRole('link', { name: 'Fill in your Profile manually instead' })).toHaveAttribute('href', '/app/profile');
    expect(saves()).toEqual([]);
  });

  it('explains an unreachable server', async () => {
    stubApi((path) => {
      if (path === '/profile/import/pdf') throw new TypeError('Failed to fetch');
      return undefined;
    });
    renderPage();
    await chooseAndImport();
    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach the FlowJob server');
  });
});

describe('review of a new account', () => {
  it('shows what was found, what was left out and what is missing, without filling anything in', async () => {
    await reachReview();
    expect(screen.getByText(/Found 2 jobs, 0 education entries, 0 projects, 2 skills/)).toBeVisible();
    expect(screen.getByText(/2 items were left out/)).toBeVisible();
    expect(screen.getByText(/Not found in your CV: Phone, Location, Education/)).toBeVisible();
    expect(screen.queryByTestId('conflict')).not.toBeInTheDocument(); // nothing in the Profile to compare
    expect(screen.queryByLabelText('CV name')).not.toBeInTheDocument();
    expect(screen.getByTestId('pdf')).toBeInTheDocument(); // the existing Harvard preview

    fireEvent.click(screen.getByRole('tab', { name: /Experience/ }));
    expect(screen.getByText('Start date not found in your CV')).toBeVisible();
    const notes = screen.getByTestId('import-notes');
    expect(notes).toHaveTextContent('Job 2 in your CV: start date: “Jan 2021”');
    expect(notes).toHaveTextContent('Found in your CV, but not where it belongs.');

    fireEvent.click(screen.getByRole('tab', { name: /Skills/ }));
    const skillNotes = screen.getByTestId('import-notes');
    expect(skillNotes).toHaveTextContent('Skill: “Kubernetes”');
    expect(screen.getAllByText(/Kubernetes/).every((element) => skillNotes.contains(element))).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: /Education/ }));
    expect(screen.getByText('Nothing found in your CV for this section.')).toBeVisible();
  });

  it('counts only what is still empty: the account fills the name and email', async () => {
    const noContact = { ...RESULT, warnings: [], missing: ['fullName', 'email', 'phone'] as CvImportResult['missing'] };
    await reachReview((path) => (path === '/profile/import/pdf' ? Response.json(noContact) : undefined));
    expect(screen.getByRole('tab', { name: /Personal/ })).toHaveTextContent(/^Personal1$/);
    expect(screen.getByText(/Not found in your CV: Phone\./)).toBeVisible();
  });

  it('does not flag a school with only its completion date, and reads a bracketed country code', async () => {
    const withSchools: CvImportResult = {
      ...RESULT, warnings: [], missing: [],
      content: {
        ...RESULT.content, phone: '(+48) 600 111 222',
        education: [
          { id: 'import-education-1', school: 'Example International School', degree: 'High School Diploma',
            start: '', end: '31/05/2023', note: '' },
          { id: 'import-education-2', school: 'Example Academy', degree: 'Short Course', start: '', end: '', note: '' },
        ],
      },
    };
    await reachReview((path) => (path === '/profile/import/pdf' ? Response.json(withSchools) : undefined));
    expect(screen.getByLabelText(/Phone number/)).toHaveValue('600 111 222');
    expect(screen.getByText('+48')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: /Education/ }));
    const school = screen.getByText('High School Diploma').closest('div')!;
    expect(school).not.toHaveTextContent(/not found/);
    expect(screen.getByText('Short Course').closest('div')).toHaveTextContent('Dates not found in your CV');
  });

  it('keeps the account name and email instead of the PDF’s', async () => {
    await reachReview();
    expect(screen.getByLabelText('Full name')).toHaveValue('Ana Nowak');
    expect(screen.getByLabelText('Full name')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Email')).toHaveValue('ana@example.com');
    expect(screen.getByText(/Your CV shows the name “Ada Example” and the email “ada@example.com”. Your account’s name and email are kept/)).toBeVisible();
  });

  it('saves to the Profile only after the user confirms, then opens the Dashboard', async () => {
    stubApi((path, init) => (path === '/profile/import' && init.method === 'POST'
      ? Response.json({ ...BLANK, ...RESULT.content, fullName: BLANK.fullName, email: BLANK.email })
      : undefined));
    const router = renderPage();
    await chooseAndImport();
    await screen.findByRole('heading', { name: 'Review your Profile' });

    fireEvent.click(screen.getByRole('tab', { name: /Summary/ }));
    fireEvent.change(summaryBox(), { target: { value: 'Edited during the review.' } });
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard import' })).toBeEnabled();
    expect(screen.queryByText(/You can import a CV into your Profile once/)).not.toBeInTheDocument();
    fireEvent.click(saveButton());
    expect(saves()).toEqual([]);

    await confirmAndSave();
    expect(await screen.findByText('DASHBOARD after import')).toBeVisible();
    expect(router.state.location.pathname).toBe('/app');
    expect(saves()).toHaveLength(1);
    const body = saveBody();
    expect(body.revision).toBe(REVISION);
    expect(body.requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body.profile).toMatchObject({ fullName: 'Ana Nowak', email: 'ana@example.com', summary: 'Edited during the review.' });
    expect(body.profile.skills).toEqual(['Python', 'FastAPI']);
    expect(body.profile.experience[1].start).toBe(''); // never filled in
    expect(body.profile.phone).toBe('');
    // Only the Profile is written: no CV is created or changed.
    expect(requests.filter((r) => r.path.startsWith('/cvs') && r.path !== '/cvs/preview/pdf')).toEqual([]);
  });
});

describe('review against an existing Profile', () => {
  const MINE: Profile = {
    ...BLANK,
    summary: 'My own words.',
    skills: ['Go', 'Rust'],
    links: ['https://www.linkedin.com/in/ana-nowak'],
    education: [{ id: 'mine-1', school: 'Gdańsk Tech', degree: 'MSc', start: '2019', end: '2021', note: '' }],
  };
  const WITH_LINK = { ...RESULT, content: { ...RESULT.content, links: ['https://www.linkedin.com/in/ada-example'] } };

  it('keeps the Profile’s values by default and fills only what the Profile lacks', async () => {
    currentStatus = status({ profile: MINE });
    await reachReview((path) => (path === '/profile/import/pdf' ? Response.json(WITH_LINK) : undefined));
    expect(screen.getByText(/Your Profile already has a different links, summary, skills/)).toBeVisible();
    expect(screen.getByRole('tab', { name: /Summary/ })).toHaveTextContent('1');
    expect(screen.getByLabelText(/LinkedIn/)).toHaveValue('https://www.linkedin.com/in/ana-nowak');

    fireEvent.click(screen.getByRole('tab', { name: /Summary/ }));
    const choice = screen.getByTestId('conflict');
    expect(choice).toHaveTextContent('Summary: your Profile and your CV differ');
    expect(within(choice).getByRole('radio', { name: /Keep my Profile’s/ })).toBeChecked();
    expect(summaryBox()).toHaveValue('My own words.');

    fireEvent.click(screen.getByRole('tab', { name: /Education/ }));
    expect(screen.getByText('MSc')).toBeVisible(); // the CV has none, so the Profile's stays without a choice

    fireEvent.click(screen.getByRole('tab', { name: /Experience/ }));
    expect(screen.queryByTestId('conflict')).not.toBeInTheDocument();
    expect(screen.getByText('Software Engineer')).toBeVisible(); // the Profile has none, so the CV's is used

    await confirmAndSave();
    await waitFor(() => expect(saves()).toHaveLength(1));
    const { profile } = saveBody();
    expect(profile.summary).toBe('My own words.');
    expect(profile.skills).toEqual(['Go', 'Rust']);
    expect(profile.links).toEqual(['https://www.linkedin.com/in/ana-nowak']);
    expect(profile.education).toEqual(MINE.education);
    expect(profile.experience).toEqual(RESULT.content.experience);
  });

  it('uses the CV’s values only where the user explicitly chooses them', async () => {
    currentStatus = status({ profile: MINE });
    await reachReview((path) => (path === '/profile/import/pdf' ? Response.json(WITH_LINK) : undefined));

    const links = screen.getAllByTestId('conflict').find((x) => x.textContent?.startsWith('Links'))!;
    fireEvent.click(within(links).getByRole('radio', { name: /Use my CV’s/ }));
    expect(screen.getByLabelText(/LinkedIn/)).toHaveValue('https://www.linkedin.com/in/ada-example');

    fireEvent.click(screen.getByRole('tab', { name: /Skills/ }));
    fireEvent.click(within(screen.getByTestId('conflict')).getByRole('radio', { name: /Use my CV’s/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Summary/ }));
    fireEvent.click(within(screen.getByTestId('conflict')).getByRole('radio', { name: /Use my CV’s/ }));
    expect(summaryBox()).toHaveValue(RESULT.content.summary);
    fireEvent.click(within(screen.getByTestId('conflict')).getByRole('radio', { name: /Keep my Profile’s/ }));
    expect(summaryBox()).toHaveValue('My own words.');

    await confirmAndSave();
    await waitFor(() => expect(saves()).toHaveLength(1));
    const { profile } = saveBody();
    expect(profile.links).toEqual(['https://www.linkedin.com/in/ada-example']);
    expect(profile.skills).toEqual(['Python', 'FastAPI']);
    expect(profile.summary).toBe('My own words.');
    expect(profile.fullName).toBe('Ana Nowak');
  });
});

describe('saving problems', () => {
  it('explains that the CV was already imported (for example in another tab)', async () => {
    await reachReview((path, init) => (path === '/profile/import' && init.method === 'POST'
      ? Response.json({ detail: 'Your CV has already been imported into your Profile.' }, { status: 409 })
      : undefined));
    await confirmAndSave();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your CV was already imported');
    expect(within(alert).getByRole('link', { name: 'Go to my Profile' })).toHaveAttribute('href', '/app/profile');
  });

  it('reviews again from the latest Profile when it changed during the review', async () => {
    let attempt = 0;
    await reachReview((path, init) => {
      if (path === '/profile/import' && init.method === 'POST') {
        attempt += 1;
        return attempt === 1
          ? Response.json({ detail: 'Your Profile changed while you were reviewing the import.' }, { status: 412 })
          : Response.json(BLANK);
      }
      return undefined;
    });
    await confirmAndSave();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your Profile changed while you were reviewing');
    // Meanwhile the summary was written by hand in another tab.
    currentStatus = status({ profile: { ...BLANK, summary: 'Written by hand.' }, revision: 'b'.repeat(64) });
    fireEvent.click(within(alert).getByRole('button', { name: 'Review again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument()); // a new review has started
    fireEvent.click(screen.getByRole('tab', { name: /Summary/ }));
    expect(await screen.findByRole('textbox', { name: 'Summary' })).toHaveValue('Written by hand.');
    expect(screen.getByTestId('conflict')).toBeVisible();

    await confirmAndSave();
    expect(await screen.findByText('DASHBOARD after import')).toBeVisible();
    expect(saveBody(1).revision).toBe('b'.repeat(64));
    expect(saveBody(1).profile.summary).toBe('Written by hand.');
  });

  it('keeps the review when saving fails and retries the same save', async () => {
    let attempt = 0;
    await reachReview((path, init) => {
      if (path === '/profile/import' && init.method === 'POST') {
        attempt += 1;
        return attempt === 1 ? Response.json({ detail: 'Could not save.' }, { status: 503 }) : Response.json(BLANK);
      }
      return undefined;
    });
    await confirmAndSave();
    expect(await screen.findByText('Could not save.')).toBeVisible();
    expect(screen.getByText(/Your review is still here/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Review your Profile' })).toBeVisible();
    fireEvent.click(saveButton());
    expect(await screen.findByText('DASHBOARD after import')).toBeVisible();
    expect(saveBody(1).requestId).toBe(saveBody(0).requestId); // a retry of one save, so the server answers once
  });
});

describe('leaving the review', () => {
  it('discards the import without saving anything', async () => {
    const router = await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Discard import' }));
    const dialog = screen.getByRole('dialog', { name: 'Discard this import?' });
    expect(dialog).toHaveTextContent('Nothing has been saved and your Profile stays as it is. You can still import your CV later.');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Discard import' }));
    });
    expect(await screen.findByText('PROFILE')).toBeVisible();
    expect(router.state.location.pathname).toBe('/app/profile');
    expect(requests.filter((r) => r.method !== 'GET' && r.path !== '/profile/import/pdf' && r.path !== '/cvs/preview/pdf')).toEqual([]);
  });

  it('keeps the file and the extracted CV out of browser storage', async () => {
    await reachReview();
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    for (const text of ['Ada Example', 'ada@example.com', 'Acme Ltd', 'Kubernetes', 'synthetic test CV']) {
      expect(stored).not.toContain(text);
    }
  });
});

describe('interruption protection', () => {
  const sidebar = () => fireEvent.click(screen.getByRole('link', { name: 'Sidebar: My CVs' }));
  function holdImport() {
    stubApi((path, init) => (path === '/profile/import/pdf' ? new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }) : undefined));
  }

  it('does not warn before an import starts, even with a file chosen', async () => {
    stubApi();
    renderPage();
    fireEvent.change(await screen.findByLabelText('CV PDF file'), { target: { files: [pdfFile()] } });
    await screen.findByText('cv.pdf');
    fireEvent.click(consentBox());
    expect(unload()).toBe(true);
    sidebar();
    expect(screen.getByText('MY CVS')).toBeInTheDocument();
  });

  it('explains while processing that leaving loses the result and may use a try, and Leave stops waiting', async () => {
    holdImport();
    renderPage();
    await chooseAndImport();
    await screen.findByRole('button', { name: 'Reading your CV…' });
    expect(unload()).toBe(false);
    sidebar();
    const dialog = screen.getByRole('dialog', { name: 'Leave while your CV is being read?' });
    expect(dialog).toHaveTextContent('still organizing your CV on the server');
    expect(dialog).toHaveTextContent('the result is lost');
    expect(dialog).toHaveTextContent('may still count toward today’s tries');
    expect(dialog).not.toHaveTextContent(/cancel/i); // the server is not cancelled, so nothing claims it is
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.getByRole('button', { name: 'Reading your CV…' })).toBeDisabled();
    const call = requests.find((r) => r.path === '/profile/import/pdf')!;
    expect(call.init.signal?.aborted).toBe(false);

    sidebar();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave' }));
    expect(screen.getByText('MY CVS')).toBeInTheDocument();
    expect(call.init.signal?.aborted).toBe(true);
    expect(saves()).toEqual([]);
  });

  it('protects the unsaved review on navigation and refresh', async () => {
    await reachReview();
    expect(unload()).toBe(false);
    sidebar();
    const dialog = screen.getByRole('dialog', { name: 'Leave without saving?' });
    expect(dialog).toHaveTextContent('has not been saved to your Profile');
    expect(dialog).toHaveTextContent('uses another of today’s tries');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.getByRole('heading', { name: 'Review your Profile' })).toBeVisible();
  });

  it('never asks after a successful save, or a second time after Discard import', async () => {
    const router = await reachReview((path, init) => (path === '/profile/import' && init.method === 'POST'
      ? Response.json({ ...BLANK, ...RESULT.content, fullName: BLANK.fullName, email: BLANK.email })
      : undefined));
    await confirmAndSave();
    expect(await screen.findByText(/DASHBOARD/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/app');
    expect(unload()).toBe(true);

    cleanup();
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Discard import' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Discard this import?' }))
      .getByRole('button', { name: 'Discard import' }));
    expect(screen.getByText('PROFILE')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
