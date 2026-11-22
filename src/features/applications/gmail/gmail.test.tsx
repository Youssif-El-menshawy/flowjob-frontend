import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ApplicationDetailPage from '@/features/applications/ApplicationDetailPage';
import ApplicationsPage from '@/features/applications/ApplicationsPage';
import { GmailSettingsCard } from '@/features/applications/gmail/GmailSettingsCard';
import type { Application, GmailReview, GmailStatus } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';
import { guardedRouter, unload } from '@/test/guardedRouter';
import { useLeaveGuard } from '@/shared/ui/LeaveGuard';
import { goTo } from './useGmailOAuth';
import { fromLocalInput, reviewReason, safeGmailUrl } from './gmailLabels';

const GMAIL_URL = 'https://mail.google.com/mail/?authuser=student@gmail.example#all/18c2f0a1b2c3d4e5';

const disconnected: GmailStatus = {
  available: true, pendingReviewCount: 0, connection: { state: 'not_connected' }, sync: null,
};
const active = (sync: Partial<NonNullable<GmailStatus['sync']>> = {}, pending = 0): GmailStatus => ({
  available: true,
  pendingReviewCount: pending,
  connection: { state: 'active', email: 'student@gmail.example' },
  sync: {
    running: false, phase: 'incremental', caughtUp: true, lastSyncAt: '2026-11-14T09:00:00Z',
    lastSuccessAt: '2026-11-14T09:00:00Z', remaining: 0, failed: 0, processed: 10, needsAttention: null,
    error: null, lastRun: null, ...sync,
  },
});

const imported: Application = {
  id: 'app1', company: 'Acme', jobTitle: 'Junior Data Analyst', status: 'Applied', cvId: null,
  dateApplied: '2026-11-02', dateAppliedProvisional: true, source: 'gmail', updatedAt: '2026-11-02T10:00:00Z',
  history: [], suggestion: null,
  activity: [
    {
      id: 'ev1', eventType: 'interview_invitation', occurredAt: '2026-11-03T10:00:00Z',
      excerpt: 'Zapraszamy na rozmowę <b>kwalifikacyjną</b>', scheduledAt: '2026-11-20T09:00:00Z',
      corrected: false, gmailUrl: GMAIL_URL,
    },
    {
      id: 'ev2', eventType: 'interview_rescheduled', occurredAt: '2026-11-05T10:00:00Z', excerpt: null,
      scheduledAt: '2026-11-21T13:00:00Z', previousScheduledAt: '2026-11-20T09:00:00Z', corrected: false,
      gmailUrl: 'javascript:alert(1)',
    },
  ],
};

const reviews: GmailReview[] = [
  {
    id: 'r-new', kind: 'new_application', state: 'pending', excerpt: 'Thanks for your interest in the analyst role',
    receivedAt: '2026-11-10T08:00:00Z', gmailUrl: GMAIL_URL, application: null, candidates: [],
    proposal: { company: 'Acme Polska', jobTitle: 'analyst', status: 'Applied', dateApplied: '2026-11-10',
      dateProvisional: true, eventType: 'recruiter_follow_up', reason: 'uncertain' },
  },
  {
    id: 'r-amb', kind: 'ambiguous_link', state: 'pending', excerpt: 'Your Data Analyst application',
    receivedAt: '2026-11-11T08:00:00Z', gmailUrl: 'https://evil.example/#all/18c2f0a1b2c3d4e5', application: null,
    candidates: [
      { id: 'a1', company: 'Acme', jobTitle: 'Data Analyst', status: 'Applied' },
      { id: 'a2', company: 'Acme', jobTitle: 'Data Analyst Intern', status: 'Applied' },
    ],
    proposal: { company: 'Acme', jobTitle: 'Data Analyst', reason: 'ambiguous_match' },
  },
  {
    id: 'r-st', kind: 'status_change', state: 'pending', excerpt: 'We would like to invite you to an interview',
    receivedAt: '2026-11-12T08:00:00Z', gmailUrl: GMAIL_URL, candidates: [],
    application: { id: 'a3', company: 'Beta', jobTitle: 'Backend Intern', status: 'Applied' },
    proposal: { from: 'Applied', to: 'Interview', eventType: 'interview_invitation' },
  },
];

type Handler = (path: string, method: string, body: unknown) => Response | Promise<Response> | undefined;
let requests: { method: string; path: string; body: unknown }[] = [];

function backend(gmail: GmailStatus | (() => GmailStatus), extra?: Handler, apps: Application[] = []) {
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, 'https://fixture.test').pathname.replace(/^\/api\/v1/, '');
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path, body });
    const custom = await extra?.(path, method, body);
    if (custom) return custom;
    if (path === '/gmail' && method === 'GET') return Response.json(typeof gmail === 'function' ? gmail() : gmail);
    if (path === '/gmail/reviews') return Response.json(reviews);
    if (path === '/applications') return Response.json(apps);
    if (path === '/applications/app1') return Response.json(imported);
    if (path === '/cvs') return Response.json([]);
    throw new Error(`Unexpected request ${method} ${path}`);
  }));
}

function Where() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
}

/** Unsaved work elsewhere on the page (like the Settings account form), to check the Google redirect asks first. */
function UnsavedElsewhere() {
  useLeaveGuard({ when: true, title: 'Leave without saving?', message: 'Your account changes have not been saved.' });
  return null;
}

// Under the app's interruption guard, as in the real routes.
function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = guardedRouter([{
    element: <><Outlet /><Link to="/app/cvs">Sidebar: My CVs</Link></>,
    children: [
      { path: '/app/applications', element: <><ApplicationsPage /><Where /></> },
      { path: '/app/applications/:id', element: <ApplicationDetailPage /> },
      { path: '/app/settings', element: <GmailSettingsCard /> },
      { path: '/app/settings-unsaved', element: <><UnsavedElsewhere /><GmailSettingsCard /></> },
      { path: '/app/cvs', element: <p>MY CVS</p> },
    ],
  }], [path]);
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const sent = (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path);

beforeEach(() => {
  vi.spyOn(goTo, 'assign').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Gmail on Applications (header) and in Settings (connection card)', () => {
  it('explains access and AI analysis before sending the user to Google', async () => {
    backend(disconnected, (path, method) =>
      path === '/gmail/oauth/start' && method === 'POST'
        ? Response.json({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=x' })
        : undefined);
    renderAt('/app/applications');
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Gmail' }));
    const dialog = screen.getByRole('dialog', { name: 'Connect Gmail' });
    expect(within(dialog).getByText(/read-only/)).toBeVisible();
    expect(within(dialog).getByText(/analysed with OpenAI/)).toBeVisible();
    expect(within(dialog).queryByRole('checkbox')).toBeNull(); // no mandatory acknowledgement
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to Google' }));
    await waitFor(() => expect(goTo.assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=x'));
    expect(sent('POST', '/gmail/oauth/start')[0].body).toMatchObject({ mode: 'connect' });
    expect(typeof (sent('POST', '/gmail/oauth/start')[0].body as { timezone?: string }).timezone).toBe('string');
  });

  it('hides Gmail when the server is not configured for it', async () => {
    backend({ ...disconnected, available: false });
    renderAt('/app/applications');
    expect(await screen.findByText('No applications yet')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Connect Gmail' })).toBeNull();
    expect(screen.getByRole('banner')).not.toHaveTextContent(/Gmail/);
  });

  it('puts one Gmail action beside Add application, with no status bar and no Disconnect', async () => {
    backend(active());
    renderAt('/app/applications');
    const header = await screen.findByRole('banner');
    expect(await within(header).findByRole('button', { name: 'Sync Gmail' })).toBeVisible();
    expect(within(header).getByRole('link', { name: 'Add application' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Gmail' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Disconnect/ })).toBeNull();
  });

  it('starts a sync from Applications and shows the real remaining count while syncing', async () => {
    const status = active();
    let current: GmailStatus = status;
    backend(() => current, (path, method) => {
      if (path === '/gmail/sync' && method === 'POST') {
        current = { ...status, sync: { ...status.sync!, running: true, caughtUp: false, remaining: 42 } };
        return Response.json(current, { status: 202 });
      }
    });
    renderAt('/app/applications');
    fireEvent.click(await screen.findByRole('button', { name: 'Sync Gmail' }));
    expect(await screen.findByText('Sync started.')).toBeVisible();
    expect(sent('POST', '/gmail/sync')[0].body).toEqual({ retryFailed: false });
    expect(await screen.findByRole('button', { name: 'Syncing… 42 left' })).toBeDisabled();
  });

  it('says Syncing… without a count when the backend reports none', async () => {
    backend(active({ running: true, remaining: 0 }));
    renderAt('/app/applications');
    expect(await screen.findByRole('button', { name: 'Syncing…' })).toBeDisabled();
  });

  it('shows the connected account, status and last sync time in Settings', async () => {
    backend(active({ lastRun: { trigger: 'scheduled', processed: 8, imported: 2, linked: 1, activities: 3, reviews: 1, failed: 0 } }));
    renderAt('/app/settings');
    expect(await screen.findByText('student@gmail.example')).toBeVisible();
    const card = screen.getByRole('region', { name: 'Gmail' });
    expect(within(card).getByText('Connected')).toBeVisible();
    expect(within(card).getByText('Last sync')).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Disconnect Gmail' })).toBeVisible();
    expect(screen.queryByText(/Up to date|Last sync:/)).toBeNull();
  });

  it('shows partial completion and errors in Settings, retries failed emails, and flags them on Applications', async () => {
    const partial = active({ caughtUp: false, remaining: 30, failed: 2,
      error: { code: 'quota_reached', message: "Today's email analysis limit was reached." } });
    const respond: Handler = (path, method) =>
      path === '/gmail/sync' && method === 'POST' ? Response.json(partial, { status: 202 }) : undefined;
    backend(partial, respond);
    renderAt('/app/applications');
    expect(await screen.findByText("Today's email analysis limit was reached.")).toBeVisible();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Gmail settings' })).toHaveAttribute('href', '/app/settings');
    expect(within(header).getByRole('button', { name: 'Sync Gmail' })).toBeVisible();
    cleanup();

    backend(partial, respond);
    renderAt('/app/settings');
    expect(await screen.findByText('30 emails left for the next sync.')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent("Today's email analysis limit was reached.");
    expect(screen.getByText('2 emails could not be analysed.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry sync' }));
    await waitFor(() => expect(sent('POST', '/gmail/sync')[0]?.body).toEqual({ retryFailed: true }));
  });

  it('reports a sync that is already running or rate limited', async () => {
    backend(active(), (path, method) =>
      path === '/gmail/sync' && method === 'POST' ? Response.json({ detail: 'A Gmail sync is already running.' }, { status: 409 }) : undefined);
    renderAt('/app/applications');
    fireEvent.click(await screen.findByRole('button', { name: 'Sync Gmail' }));
    expect(await screen.findByText('A Gmail sync is already running.')).toBeVisible();
  });

  it('asks to reconnect when Google access expired, on Applications and in Settings', async () => {
    const expired: GmailStatus = { ...active(), connection: { state: 'reauth_required', email: 'student@gmail.example' } };
    backend(expired);
    renderAt('/app/applications');
    expect(await screen.findByRole('button', { name: 'Reconnect Gmail' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sync Gmail' })).toBeNull();
    cleanup();

    backend(expired, (path) =>
      path === '/gmail/oauth/start' ? Response.json({ authorizationUrl: 'https://accounts.google.com/x' }) : undefined);
    renderAt('/app/settings');
    expect(await screen.findByText(/Google access expired. Reconnect with the same account/)).toBeVisible();
    expect(screen.getByText('Access expired')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Gmail' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Reconnect Gmail' })).getByRole('button', { name: 'Continue to Google' }));
    await waitFor(() => expect(sent('POST', '/gmail/oauth/start')[0]?.body).toMatchObject({ mode: 'reconnect' }));
  });

  it('confirms before disconnecting in Settings, explains what is kept, then offers Connect Gmail', async () => {
    let state: GmailStatus = active();
    backend(() => state, (path, method) => {
      if (path === '/gmail' && method === 'DELETE') {
        state = disconnected;
        return new Response(null, { status: 204 });
      }
    });
    renderAt('/app/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Gmail' }));
    const dialog = screen.getByRole('dialog', { name: 'Disconnect Gmail?' });
    expect(within(dialog).getByText(/Applications you already have, and statuses you approved, stay./)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByText('Gmail disconnected.')).toBeVisible();
    expect(sent('DELETE', '/gmail')).toHaveLength(1);
    expect(await screen.findByRole('button', { name: 'Connect Gmail' })).toBeVisible();
  });

  it('shows a load error with Retry in Settings', async () => {
    let fail = true;
    backend(active(), (path) => (path === '/gmail' && fail ? Response.json({ detail: 'down' }, { status: 503 }) : undefined));
    renderAt('/app/settings');
    expect(await screen.findByText('Could not load Gmail status.')).toBeVisible();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('student@gmail.example')).toBeVisible();
  });

  it.each([
    ['?gmail=connected', 'Gmail connected. Checking the last 30 days…'],
    ['?gmail=reconnected', 'Gmail reconnected.'],
    ['?gmail=error&reason=account_in_use', 'That Google account is already connected to another FlowJob account.'],
    ['?gmail=error&reason=whatever', 'Could not connect Gmail. Try again.'],
  ])('reports the OAuth return %s once and cleans the URL', async (query, message) => {
    backend(active());
    renderAt(`/app/applications${query}`);
    expect(await screen.findByText(message)).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/applications$/));
  });
});

describe('Needs Review', () => {
  const openReview = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /^Needs review/ }));
    return screen.getByRole('dialog', { name: 'Needs review' });
  };
  const card = (dialog: HTMLElement) => within(dialog).getByRole('listitem');

  it('shows a slim bar with the count and opens a dialog with one suggestion at a time', async () => {
    backend(active({}, 3));
    renderAt('/app/applications');
    const bar = await screen.findByRole('button', { name: /^Needs review/ });
    expect(bar).toHaveTextContent('3 waiting');
    expect(bar).toHaveTextContent('Review');
    expect(screen.queryByText('New application: Acme Polska · analyst')).toBeNull(); // nothing expanded
    fireEvent.click(bar);
    const dialog = screen.getByRole('dialog', { name: 'Needs review' });
    expect(await within(dialog).findByText('1 of 3')).toBeVisible();
    expect(within(dialog).getByText('New application: Acme Polska · analyst')).toBeVisible();
    expect(within(dialog).getByText('“Thanks for your interest in the analyst role”')).toBeVisible();
    expect(within(dialog).getByText(/not a confirmed submission date/)).toBeVisible();
    expect(within(dialog).getByText('FlowJob could not confirm this automatically. Please check the details.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Previous suggestion' })).toBeDisabled();
    const link = within(dialog).getByRole('link', { name: 'Open in Gmail' });
    expect(link).toHaveAttribute('href', GMAIL_URL);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next suggestion' }));
    expect(within(dialog).getByText('2 of 3')).toBeVisible();
    expect(within(dialog).getByText(/Which application is this\?/)).toBeVisible();
    expect(within(dialog).queryByRole('link', { name: 'Open in Gmail' })).toBeNull(); // foreign link not rendered
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next suggestion' }));
    expect(within(dialog).getByText('3 of 3')).toBeVisible();
    expect(within(dialog).getByText('Move Beta to Interview?')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Next suggestion' })).toBeDisabled();
  });

  it('hides the bar when nothing waits for review', async () => {
    backend(active());
    renderAt('/app/applications');
    expect(await screen.findByRole('button', { name: 'Sync Gmail' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Needs review/ })).toBeNull();
  });

  it('closing without acting changes nothing, and drops unsaved edits after asking', async () => {
    backend(active({}, 3));
    renderAt('/app/applications');
    let dialog = await openReview();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Edit' }));
    fireEvent.change(within(dialog).getByLabelText('Job title'), { target: { value: 'Changed title' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close review' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Discard your changes?' }))
      .getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/applications$/);

    dialog = await openReview();
    expect(await within(dialog).findByText('1 of 3')).toBeVisible();
    expect(within(dialog).queryByLabelText('Job title')).toBeNull(); // not editing any more
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('edits and approves, prevents double submission, and updates the list and count at once', async () => {
    let release!: (r: Response) => void;
    let pending = 3;
    backend(() => active({}, pending), (path) => {
      if (path === '/gmail/reviews/r-new/approve') return new Promise<Response>((r) => { release = r; });
      if (path === '/gmail/reviews/r-st/dismiss') {
        pending -= 1;
        return Response.json({ review: 'dismissed' });
      }
    });
    renderAt('/app/applications');
    const dialog = await openReview();
    const first = await within(dialog).findByText('New application: Acme Polska · analyst');
    const item = first.closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(item).getByLabelText('Job title'), { target: { value: 'Junior Data Analyst' } });
    fireEvent.change(within(item).getByLabelText('Date applied'), { target: { value: '2026-11-01' } });
    const save = within(item).getByRole('button', { name: 'Save and approve' });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(sent('POST', '/gmail/reviews/r-new/approve')).toHaveLength(1));
    expect(sent('POST', '/gmail/reviews/r-new/approve')[0].body).toEqual({
      company: 'Acme Polska', jobTitle: 'Junior Data Analyst', status: 'Applied', dateApplied: '2026-11-01',
    });
    expect(within(item).getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    pending -= 1;
    release(Response.json({ review: 'approved', applicationId: 'new1' }));
    expect(await screen.findByText('Saved.')).toBeVisible();

    // The decided suggestion leaves immediately; the next one is shown and the counts drop.
    await waitFor(() => expect(within(dialog).getByText('1 of 2')).toHaveFocus());
    expect(within(dialog).queryByText('New application: Acme Polska · analyst')).toBeNull();
    expect(screen.getByRole('button', { name: /^Needs review/ })).toHaveTextContent('2 waiting');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next suggestion' }));
    fireEvent.click(within(card(dialog)).getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByText('Dismissed.')).toBeVisible();
    expect(await within(dialog).findByText('1 of 1')).toBeVisible();
    expect(within(dialog).getByText(/Which application is this\?/)).toBeVisible();
  });

  it('closes by itself after the last suggestion is decided', async () => {
    let pending = 1;
    const single = [reviews[2]];
    backend(() => active({}, pending), (path) => {
      if (path === '/gmail/reviews') return Response.json(pending ? single : []);
      if (path === '/gmail/reviews/r-st/approve') {
        pending = 0;
        return Response.json({ review: 'approved', applicationId: 'a3' });
      }
    });
    renderAt('/app/applications');
    const dialog = await openReview();
    expect(await within(dialog).findByText('1 of 1')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Next suggestion' })).toBeNull();
    fireEvent.click(within(card(dialog)).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Saved.')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Needs review/ })).toBeNull());
    expect(sent('POST', '/gmail/reviews/r-st/approve')[0].body).toEqual({});
  });

  it('requires choosing an application for an ambiguous match', async () => {
    backend(active({}, 3), (path) =>
      path === '/gmail/reviews/r-amb/approve' ? Response.json({ review: 'approved', applicationId: 'a2' }) : undefined);
    renderAt('/app/applications');
    const dialog = await openReview();
    await within(dialog).findByText('1 of 3');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next suggestion' }));
    const approve = within(card(dialog)).getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText(/Data Analyst Intern/));
    fireEvent.click(approve);
    expect(await screen.findByText('Linked to your application.')).toBeVisible();
    expect(sent('POST', '/gmail/reviews/r-amb/approve')[0].body).toEqual({ applicationId: 'a2' });
  });

  it('shows a stale-suggestion error from the server and keeps the suggestion', async () => {
    backend(active({}, 3), (path) =>
      path === '/gmail/reviews/r-st/approve'
        ? Response.json({ detail: 'This suggestion is out of date: the application changed since it was made.' }, { status: 409 })
        : undefined);
    renderAt('/app/applications');
    const dialog = await openReview();
    await within(dialog).findByText('1 of 3');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next suggestion' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next suggestion' }));
    fireEvent.click(within(card(dialog)).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/This suggestion is out of date/)).toBeVisible();
    expect(within(dialog).getByText('3 of 3')).toBeVisible();
  });

  it('shows a load error with Retry inside the dialog', async () => {
    let fail = true;
    backend(active({}, 3), (path) =>
      path === '/gmail/reviews' && fail ? Response.json({ detail: 'down' }, { status: 503 }) : undefined);
    renderAt('/app/applications');
    const dialog = await openReview();
    expect(await within(dialog).findByText('Could not load suggestions.')).toBeVisible();
    fail = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(await within(dialog).findByText('1 of 3')).toBeVisible();
  });

  it('keeps Sync Gmail in the header while reviews are pending; the bar is the only review entry', async () => {
    backend(active({}, 3), (path, method) =>
      path === '/gmail/sync' && method === 'POST' ? Response.json(active({ running: true }, 3), { status: 202 }) : undefined);
    renderAt('/app/applications');
    const header = await screen.findByRole('banner');
    const sync = await within(header).findByRole('button', { name: 'Sync Gmail' });
    expect(screen.queryByRole('button', { name: /Review emails/ })).toBeNull();
    expect(within(header).getByRole('link', { name: 'Add application' })).toBeVisible();
    expect(await screen.findByRole('button', { name: /^Needs review/ })).toHaveTextContent('3 waiting');
    fireEvent.click(sync);
    expect(await within(header).findByRole('button', { name: 'Syncing…' })).toBeDisabled();
    expect(sent('POST', '/gmail/sync')[0].body).toEqual({ retryFailed: false });
  });

  it('opens the dialog from the bar and from ?review', async () => {
    backend(active({}, 3));
    renderAt('/app/applications');
    fireEvent.click(await screen.findByRole('button', { name: /^Needs review/ }));
    expect(screen.getByRole('dialog', { name: 'Needs review' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/applications?review=1');
    cleanup();

    backend(active({}, 3));
    renderAt('/app/applications?review=1');
    expect(await screen.findByRole('dialog', { name: 'Needs review' })).toBeVisible();
  });
});

describe('Application details', () => {
  it('shows a Gmail import without a CV, a provisional date and the recruitment timeline', async () => {
    backend(active());
    renderAt('/app/applications/app1');
    expect(await screen.findByText(/imported from Gmail/)).toBeVisible();
    expect(screen.getByText('Not linked')).toBeVisible();
    expect(screen.getByText(/from a Gmail message, please check/)).toBeVisible();
    expect(screen.getByText('Imported from Gmail')).toBeVisible();
    const timeline = screen.getByRole('heading', { name: 'Recruitment activity' }).closest('div')!;
    expect(within(timeline).getByText('Interview invitation')).toBeVisible();
    expect(within(timeline).getByText('Interview rescheduled')).toBeVisible();
    // Excerpts render as text, never as markup.
    expect(within(timeline).getByText('“Zapraszamy na rozmowę <b>kwalifikacyjną</b>”')).toBeVisible();
    expect(timeline.querySelector('b')).toBeNull();
    expect(within(timeline).getByText('previously', { exact: false }).querySelector('s')).not.toBeNull();
    // Only the backend-built Gmail link is rendered; the javascript: one is dropped.
    const links = within(timeline).getAllByRole('link', { name: 'Open in Gmail' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', GMAIL_URL);
  });

  it('corrects and dismisses activity', async () => {
    backend(active(), (path, method) => {
      if (path === '/applications/app1/activity/ev1' && method === 'PATCH')
        return Response.json({ ...imported, activity: [{ ...imported.activity![0], eventType: 'assessment', corrected: true }] });
      if (path === '/applications/app1/activity/ev2/dismiss') return Response.json({ ...imported, activity: [imported.activity![0]] });
    });
    renderAt('/app/applications/app1');
    await screen.findByRole('heading', { name: 'Recruitment activity' });
    const first = screen.getByText('Interview invitation').closest('li')!;
    fireEvent.click(within(first).getByRole('button', { name: 'Correct' }));
    fireEvent.change(within(first).getByLabelText('Activity type'), { target: { value: 'assessment' } });
    fireEvent.click(within(first).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Activity corrected.')).toBeVisible();
    expect(sent('PATCH', '/applications/app1/activity/ev1')[0].body).toEqual({ eventType: 'assessment' });

    const second = screen.getByText('Interview rescheduled').closest('li')!;
    fireEvent.click(within(second).getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByText('Activity dismissed.')).toBeVisible();
  });
});

describe('helpers', () => {
  it('accepts only Gmail web links with a hex message id', () => {
    expect(safeGmailUrl(GMAIL_URL)).toBe(GMAIL_URL);
    for (const bad of ['javascript:alert(1)', 'http://mail.google.com/mail/#all/18c2f0a1b2c3d4e5',
      'https://mail.google.com.evil.example/mail/#all/18c2f0a1b2c3d4e5', 'https://mail.google.com/mail/#all/../x',
      'https://evil.example/mail/#all/18c2f0a1b2c3d4e5', null, '']) {
      expect(safeGmailUrl(bad)).toBeNull();
    }
  });

  it('turns a local date-time into ISO with an offset', () => {
    const iso = fromLocalInput('2026-12-03T10:00');
    expect(iso).toMatch(/^2026-12-03T10:00:00[+-]\d{2}:\d{2}$/);
    expect(new Date(iso!).getTime()).toBe(new Date('2026-12-03T10:00').getTime());
    expect(fromLocalInput('')).toBeNull();
  });
});

describe('review reasons from the grounding policy', () => {
  it.each([
    ['ungrounded_employer', 'The employer named for this role does not appear in the email.'],
    ['ungrounded_title', 'The job title does not appear in the email.'],
    ['possible_advertisement', 'This looks like an invitation to apply rather than an application you sent.'],
    ['low_confidence', 'The analysis was not confident that this email is about an application you made.'],
    ['medium_confidence', 'The analysis was only partly confident, and the email is not an explicit application confirmation.'],
    ['invalid_match', 'The analysis referred to an application that could not be verified.'],
    ['unverified_quote', 'The supporting excerpt could not be found in the email.'],
    ['weak_quote', 'The supporting excerpt is too short to rely on.'],
    ['weak_evidence', 'The email does not clearly show that you applied.'],
    ['uncertain', 'FlowJob could not confirm this automatically. Please check the details.'],
  ])('explains %s', (reason, text) => {
    expect(reviewReason({ ...reviews[0], proposal: { ...reviews[0].proposal, reason } })).toBe(text);
  });
});

describe('pre-merge hardening', () => {
  const disconnecting: GmailStatus = {
    available: true, pendingReviewCount: 0, connection: { state: 'disconnecting' }, sync: null,
  };

  it('shows an interrupted disconnect and lets the user finish it safely', async () => {
    let state: GmailStatus = disconnecting;
    backend(() => state, (path, method) => {
      if (path === '/gmail' && method === 'DELETE') {
        state = disconnected;
        return new Response(null, { status: 204 });
      }
    });
    renderAt('/app/settings');
    expect(await screen.findByText(/Disconnecting… FlowJob is erasing its Gmail data/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Connect Gmail' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect Gmail' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Finish disconnecting' }));
    expect(await screen.findByText('Gmail disconnected.')).toBeVisible();
    expect(sent('DELETE', '/gmail')).toHaveLength(1);
    expect(await screen.findByRole('button', { name: 'Connect Gmail' })).toBeVisible();
  });

  it('shows the disconnecting state after a disconnect fails midway', async () => {
    let state: GmailStatus = active();
    backend(() => state, (path, method) => {
      if (path === '/gmail' && method === 'DELETE') {
        state = disconnecting;
        return Response.json({ detail: 'Gmail could not be fully disconnected. Try again.' }, { status: 503 });
      }
    });
    renderAt('/app/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Gmail' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Disconnect Gmail?' })).getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByText('Gmail could not be fully disconnected. Try again.')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Finish disconnecting' })).toBeVisible();
  });

  it('discloses that dismissed suggestions may reappear after reconnecting', async () => {
    backend(active());
    renderAt('/app/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Gmail' }));
    const dialog = screen.getByRole('dialog', { name: 'Disconnect Gmail?' });
    expect(within(dialog).getByText(/suggestions you dismissed may reappear/)).toBeVisible();
    cleanup();
    backend(disconnected);
    renderAt('/app/applications');
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Gmail' }));
    expect(within(screen.getByRole('dialog', { name: 'Connect Gmail' })).getByText(/dismissed suggestions may appear again/)).toBeVisible();
  });

  it('says a temporary Gmail failure is retried automatically, without asking to reconnect', async () => {
    backend(active({
      error: { code: 'gmail_rate_limited', message: 'Gmail asked FlowJob to slow down. FlowJob retries automatically after a pause.' },
      retryAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    }));
    renderAt('/app/settings');
    expect(await screen.findByRole('alert')).toHaveTextContent(/retries automatically after a pause\. Next try/);
    expect(screen.queryByRole('button', { name: 'Reconnect Gmail' })).toBeNull();
  });

  it('asks the user to enter a time the email gave in an unconvertible time zone', async () => {
    const schedule: GmailReview = {
      id: 'r-time', kind: 'schedule_change', state: 'pending', excerpt: 'Interview on 19 November at 11:00 PST',
      receivedAt: '2026-11-12T08:00:00Z', gmailUrl: GMAIL_URL, candidates: [],
      application: { id: 'a3', company: 'Beta', jobTitle: 'Backend Intern', status: 'Interview' },
      proposal: { scheduledAt: null, eventType: 'interview_invitation', timeIssue: 'unsupported_timezone',
        statedTime: '2026-11-19T11:00 PST' },
    };
    backend(active({}, 1), (path) => {
      if (path === '/gmail/reviews') return Response.json([schedule]);
      if (path === '/gmail/reviews/r-time/approve') return Response.json({ review: 'approved', applicationId: 'a3' });
    });
    renderAt('/app/applications');
    fireEvent.click(await screen.findByRole('button', { name: /^Needs review/ }));
    const card = (await screen.findByText('Update the date for Beta?')).closest('li')!;
    expect(within(card).getByText('Backend Intern')).toBeVisible();
    expect(within(card).getByText('The email says: 2026-11-19T11:00 PST')).toBeVisible();
    expect(within(card).getByText(/time zone FlowJob cannot convert reliably/)).toBeVisible();
    const save = within(card).getByRole('button', { name: 'Save date' });
    expect(save).toBeDisabled();
    fireEvent.change(within(card).getByLabelText('Date and time (your time zone)'), { target: { value: '2026-11-19T20:00' } });
    fireEvent.click(save);
    expect(await screen.findByText('Date saved.')).toBeVisible();
    const body = sent('POST', '/gmail/reviews/r-time/approve')[0].body as { scheduledAt: string };
    expect(body.scheduledAt).toMatch(/^2026-11-19T20:00:00[+-]\d{2}:\d{2}$/);
  });
});

describe('interruption protection with Gmail', () => {
  const openReview = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /^Needs review/ }));
    return screen.getByRole('dialog', { name: 'Needs review' });
  };

  it('asks before Next, Close or leaving drops edits on a suggestion; untouched ones move freely', async () => {
    backend(active({}, 3));
    renderAt('/app/applications');
    const dialog = await openReview();
    expect(await within(dialog).findByText('1 of 3')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next suggestion' }));
    expect(within(dialog).getByText('2 of 3')).toBeVisible(); // nothing changed: no question
    fireEvent.click(within(dialog).getByRole('button', { name: 'Previous suggestion' }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(dialog).getByLabelText('Job title'), { target: { value: 'Changed title' } });
    expect(unload()).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next suggestion' }));
    const ask = screen.getByRole('dialog', { name: 'Discard your changes?' });
    expect(ask).toHaveTextContent('Nothing is approved or dismissed until you choose.');
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }));
    expect(within(dialog).getByText('1 of 3')).toBeVisible();
    expect(within(dialog).getByLabelText('Job title')).toHaveValue('Changed title');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next suggestion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(within(dialog).getByText('2 of 3')).toBeVisible();
    expect(unload()).toBe(true);
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('never interrupts a running sync: no question on leaving or refreshing, and the status comes back on reload', async () => {
    backend(active({ running: true, remaining: 7 }));
    renderAt('/app/applications');
    expect(await screen.findByRole('button', { name: 'Syncing… 7 left' })).toBeDisabled();
    expect(unload()).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: 'Sidebar: My CVs' }));
    expect(screen.getByText('MY CVS')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent('POST', '/gmail/sync')).toEqual([]);

    cleanup(); // a refresh: a fresh page reads the sync state from the server again
    renderAt('/app/applications');
    expect(await screen.findByRole('button', { name: 'Syncing… 7 left' })).toBeDisabled();
    expect(sent('POST', '/gmail/sync')).toEqual([]);
  });

  it('asks once before Connect Gmail leaves unsaved work for Google, without a second browser warning', async () => {
    backend(disconnected, (path, method) => (path === '/gmail/oauth/start' && method === 'POST'
      ? Response.json({ authorizationUrl: 'https://accounts.google.com/o/oauth2/auth?fixture=1' })
      : undefined));
    renderAt('/app/settings-unsaved');
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Gmail' }));
    const consent = screen.getByRole('dialog');
    const proceed = within(consent).getAllByRole('button').find((b) => /Google|Continue|Connect/.test(b.textContent ?? ''))!;
    fireEvent.click(proceed);
    const ask = await screen.findByRole('dialog', { name: 'Continue to Google?' });
    expect(ask).toHaveTextContent('Your account changes have not been saved.');
    expect(goTo.assign).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole('button', { name: 'Continue to Google' }));
    await waitFor(() => expect(goTo.assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth?fixture=1'));
    expect(unload()).toBe(true);
  });
});
