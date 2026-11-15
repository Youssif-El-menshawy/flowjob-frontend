import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent, Application, ApplicationStatus, GmailStatus, MatchResult } from '@/shared/api/types';
import { STATUSES } from '@/shared/api/types';

// Mutable query-hook results, configured per test. Mocking the query module keeps the
// Dashboard pure-render so we can prove it never crashes on real-shaped application data.
const completeProfile = {
  fullName: 'A', email: 'a@x.com', phone: '', location: 'NYC', links: [], summary: 'x'.repeat(40),
  experience: [{ id: '0' }], education: [{ id: '0' }], projects: [], skills: ['a', 'b', 'c', 'd'], languages: '',
};

type Q<T> = { data: T | undefined; isLoading?: boolean; isError?: boolean; isFetching?: boolean; refetch?: () => void };

const mocks = vi.hoisted(() => ({
  apps: { data: [], isLoading: false, isError: false } as Q<Application[]>,
  cvs: { data: [{ id: 'cv1', name: 'My CV' }] } as Q<{ id: string; name: string }[]>,
  matches: { data: [] } as Q<MatchResult[]>,
  gmail: { data: undefined } as Q<GmailStatus>,
  profile: { data: undefined as unknown },
  startOAuth: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('@/shared/api/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/queries')>()),
  useApplications: () => ({ refetch: vi.fn(), ...mocks.apps }),
  useCvs: () => ({ refetch: vi.fn(), ...mocks.cvs }),
  useMatches: () => ({ refetch: vi.fn(), ...mocks.matches }),
  useGmail: () => ({ refetch: vi.fn(), ...mocks.gmail }),
  useProfile: () => mocks.profile,
  useStartGmailOAuth: () => ({ mutate: mocks.startOAuth, isPending: false }),
  useSyncGmail: () => ({ mutate: mocks.sync, isPending: false }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { name: 'Test User' } }) }));

import DashboardPage from './DashboardPage';
import { goTo } from '@/features/applications/gmail/useGmailOAuth';
import { ToastProvider } from '@/shared/ui/Overlay';

/** Minimal application exactly as the REAL API returns it — crucially without the mock-only
 *  `history`/`suggestion` keys, and often without optional fields. This is the shape that
 *  previously crashed the dashboard. */
function realApp(over: Partial<Application> = {}): Application {
  return {
    id: Math.random().toString(36).slice(2),
    company: 'Acme',
    jobTitle: 'Engineer',
    status: 'Applied',
    updatedAt: '2026-02-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  } as Application;
}

const event = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: Math.random().toString(36).slice(2),
  eventType: 'interview_invitation',
  occurredAt: '2026-01-10T09:00:00Z',
  corrected: false,
  ...over,
});

const inDays = (n: number, hour = 14) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const dateInDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function gmailStatus(over: Partial<GmailStatus> = {}, sync: Partial<NonNullable<GmailStatus['sync']>> = {}): GmailStatus {
  return {
    available: true,
    pendingReviewCount: 0,
    connection: { state: 'active', email: 'me@gmail.com' },
    sync: {
      running: false, phase: 'incremental', caughtUp: true, remaining: 0, failed: 0, processed: 10,
      lastSuccessAt: null, needsAttention: null, error: null, retryAt: null, ...sync,
    },
    ...over,
  };
}

const match = (over: Partial<MatchResult> = {}): MatchResult => ({
  id: 'm1', cvId: 'cv1', cvName: 'My CV', jobTitle: 'Frontend Engineer', company: 'Globex', jobText: '',
  score: 82, verdict: 'Strong match', summary: 'Your CV clearly shows React and TypeScript.', strengths: [], gaps: [],
  createdAt: '2026-02-01T00:00:00Z', ...over,
});

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <DashboardPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The header's action area (Gmail action + Check a job match). */
const header = () => screen.getByRole('banner');

beforeEach(() => {
  mocks.apps = { data: [], isLoading: false, isError: false };
  mocks.cvs = { data: [{ id: 'cv1', name: 'My CV' }] };
  mocks.matches = { data: [] };
  mocks.gmail = { data: { available: true, pendingReviewCount: 0, connection: { state: 'not_connected' }, sync: null } };
  mocks.profile = { data: undefined };
  mocks.startOAuth.mockReset();
  mocks.sync.mockReset();
  vi.spyOn(goTo, 'assign').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DashboardPage (regression: must never blank-crash)', () => {
  it('renders with zero applications', () => {
    const { container } = renderDashboard();
    expect(container.textContent).toContain('Test'); // greeting header always present
  });

  it('renders with one application that omits history/suggestion and optional fields', () => {
    mocks.apps = { data: [realApp()], isLoading: false, isError: false };
    const { container } = renderDashboard();
    // Previously threw "Cannot read properties of undefined (reading 'length')".
    expect(container.textContent).toContain('application');
  });

  it('renders with multiple applications across every supported status', () => {
    mocks.apps = { data: STATUSES.map((s: ApplicationStatus) => realApp({ status: s })), isLoading: false };
    renderDashboard();
    expect(screen.getByRole('heading', { name: /Application overview/ })).toBeVisible();
  });

  it('renders applications missing dates, notes and linked CVs', () => {
    mocks.apps = {
      data: [
        realApp({ status: 'Interview', dateApplied: undefined, notes: undefined, cvId: undefined }),
        realApp({ status: 'Offer' }),
      ],
      isLoading: false,
    };
    expect(() => renderDashboard()).not.toThrow();
  });

  it('renders during the loading state without claiming counts', () => {
    mocks.apps = { data: undefined, isLoading: true };
    renderDashboard();
    expect(screen.getByText('Loading your applications…')).toBeVisible();
    expect(screen.queryByText(/active application/)).not.toBeInTheDocument();
  });

  it('shows an error with Retry instead of onboarding when applications fail to load', () => {
    const refetch = vi.fn();
    mocks.apps = { data: undefined, isLoading: false, isError: true, refetch };
    renderDashboard();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your applications and CVs.');
    expect(screen.queryByText('Let’s get you set up')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows "Complete your profile" onboarding when the profile is incomplete', () => {
    mocks.profile = { data: { ...completeProfile, skills: [] } }; // incomplete (no skills)
    const { container } = renderDashboard();
    expect(container.textContent).toContain('Complete your profile');
  });

  it('hides the profile step once the profile is complete', () => {
    mocks.profile = { data: completeProfile };
    const { container } = renderDashboard();
    expect(container.textContent).not.toContain('Complete your profile');
    expect(container.textContent).toContain('Create your CV'); // other steps remain
  });
});

describe('Dashboard header and overview', () => {
  beforeEach(() => {
    mocks.apps = {
      data: [
        realApp({ status: 'Saved' }),
        realApp({ status: 'Applied' }),
        realApp({ status: 'Applied' }),
        realApp({ status: 'Interview' }),
        realApp({ status: 'Offer' }),
        realApp({ status: 'Rejected' }),
        realApp({ status: 'Rejected' }),
        realApp({ status: 'Withdrawn' }),
      ],
      isLoading: false,
    };
  });

  it('greets the user and summarises accurate counts with both primary actions', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening), Test\./);
    expect(screen.getByText('5 active applications · 1 at interview · 1 offer.')).toBeVisible();
    expect(within(header()).getByRole('button', { name: 'Connect Gmail' })).toBeVisible(); // replaces Add application
    expect(screen.queryByRole('link', { name: 'Add application' })).not.toBeInTheDocument();
    expect(within(header()).getByRole('link', { name: 'Check a job match' })).toHaveAttribute('href', '/app/match');
  });

  it('shows one equal summary tile per status with real counts, grouped into in progress and closed', () => {
    renderDashboard();
    const expected: Record<ApplicationStatus, string> = {
      Saved: 'Saved: 1 application',
      Applied: 'Applied: 2 applications',
      Interview: 'Interview: 1 application',
      Offer: 'Offer: 1 application',
      Rejected: 'Rejected: 2 applications',
      Withdrawn: 'Withdrawn: 1 application',
    };
    for (const s of STATUSES) {
      const tile = screen.getByRole('link', { name: expected[s] });
      expect(tile).toHaveAttribute('href', `/app/applications?status=${s}`);
      expect(tile).not.toHaveAttribute('style'); // no decorative heights that could misrepresent counts
    }
    expect(screen.getByRole('group', { name: 'In progress · 5' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Closed · 3' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open board' })).toHaveAttribute('href', '/app/applications');
  });

  it('lists recent applications as accessible links with employer, title, date and status', () => {
    mocks.apps = {
      data: [realApp({ id: 'a1', company: 'Initech', jobTitle: 'Designer', dateApplied: '2026-03-04', status: 'Interview' })],
      isLoading: false,
    };
    renderDashboard();
    const row = screen.getByRole('link', { name: /Initech/ });
    expect(row).toHaveAttribute('href', '/app/applications/a1');
    expect(row).toHaveTextContent('Designer');
    expect(row).toHaveTextContent('Applied 4 Mar');
    expect(row).toHaveTextContent('Interview');
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/app/applications');
  });
});

describe('Dashboard header Gmail action', () => {
  beforeEach(() => {
    mocks.apps = { data: [realApp()], isLoading: false };
  });

  it('has no Gmail banner: Gmail is one header action next to Check a job match', () => {
    mocks.gmail = { data: gmailStatus({ pendingReviewCount: 2 }) };
    renderDashboard();
    expect(screen.queryByRole('region', { name: 'Gmail' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Gmail updates? to review/)).not.toBeInTheDocument();
    const links = within(header()).getAllByRole('link').map((l) => l.textContent);
    expect(links).toEqual(['Review emails (2)', 'Check a job match']);
  });

  it('Connect Gmail opens the existing consent dialog and OAuth start', () => {
    mocks.startOAuth.mockImplementation((_mode, opts) => opts.onSuccess({ authorizationUrl: 'https://accounts.google.com/x' }));
    renderDashboard();
    expect(screen.getAllByRole('button', { name: 'Connect Gmail' })).toHaveLength(1);
    fireEvent.click(within(header()).getByRole('button', { name: 'Connect Gmail' }));
    const dialog = screen.getByRole('dialog', { name: 'Connect Gmail' });
    expect(within(dialog).getByText(/read-only/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to Google' }));
    expect(mocks.startOAuth).toHaveBeenCalledWith('connect', expect.anything());
    expect(goTo.assign).toHaveBeenCalledWith('https://accounts.google.com/x');
  });

  it('falls back to Add application when Gmail is not configured on the server', () => {
    mocks.gmail = { data: { available: false, pendingReviewCount: 0, connection: { state: 'not_connected' }, sync: null } };
    renderDashboard();
    expect(within(header()).getByRole('link', { name: 'Add application' })).toHaveAttribute('href', '/app/applications/new');
    expect(screen.queryByText(/Gmail/)).not.toBeInTheDocument();
  });

  it('Sync Gmail starts the existing sync when connected with nothing pending', () => {
    mocks.gmail = { data: gmailStatus() };
    renderDashboard();
    fireEvent.click(within(header()).getByRole('button', { name: 'Sync Gmail' }));
    expect(mocks.sync).toHaveBeenCalledWith(false, expect.anything());
  });

  it('shows a disabled Syncing… button and small progress text while syncing', () => {
    mocks.gmail = { data: gmailStatus({ pendingReviewCount: 4 }, { running: true, phase: 'backfill', caughtUp: false, remaining: 12 }) };
    renderDashboard();
    expect(within(header()).getByRole('button', { name: 'Syncing…' })).toBeDisabled();
    expect(within(header()).getByText(/Checking the last 30 days of email… 12 emails to go\./)).toBeVisible();
  });

  it('links Review emails (N) to Applications when reviews are pending', () => {
    mocks.gmail = { data: gmailStatus({ pendingReviewCount: 3 }) };
    renderDashboard();
    expect(within(header()).getByRole('link', { name: 'Review emails (3)' })).toHaveAttribute('href', '/app/applications');
  });

  it('shows Manage Gmail with the backend message when sync has a problem', () => {
    mocks.gmail = {
      data: gmailStatus({}, { error: { code: 'gmail_unavailable', message: 'Gmail is temporarily unavailable.' }, failed: 2 }),
    };
    renderDashboard();
    expect(within(header()).getByRole('link', { name: 'Manage Gmail' })).toHaveAttribute('href', '/app/applications');
    expect(within(header()).getByText('Gmail is temporarily unavailable.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sync Gmail' })).not.toBeInTheDocument();
  });

  it('shows Manage Gmail when the Gmail status cannot be loaded', () => {
    mocks.gmail = { data: undefined, isError: true };
    renderDashboard();
    expect(within(header()).getByRole('link', { name: 'Manage Gmail' })).toBeVisible();
    expect(within(header()).getByText('Could not load Gmail status.')).toBeVisible();
  });

  it('reconnects through the same dialog in reconnect mode when access expired', () => {
    mocks.gmail = { data: gmailStatus({ connection: { state: 'reauth_required', email: 'me@gmail.com' } }) };
    renderDashboard();
    expect(within(header()).getByText('Gmail access expired. Reconnect to keep tracking.')).toBeVisible();
    fireEvent.click(within(header()).getByRole('button', { name: 'Reconnect Gmail' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Reconnect Gmail' })).getByRole('button', { name: 'Continue to Google' }));
    expect(mocks.startOAuth).toHaveBeenCalledWith('reconnect', expect.anything());
  });

  it('sends an interrupted disconnect to Applications to finish', () => {
    mocks.gmail = { data: gmailStatus({ connection: { state: 'disconnecting' } }) };
    renderDashboard();
    expect(within(header()).getByRole('link', { name: 'Manage Gmail' })).toHaveAttribute('href', '/app/applications');
    expect(within(header()).getByText('Gmail is disconnecting. Finish it on Applications.')).toBeVisible();
  });

  it('keeps the header quiet when Gmail is connected and idle', () => {
    mocks.gmail = { data: gmailStatus() };
    renderDashboard();
    expect(header()).not.toHaveTextContent(/Checking|attention|expired|could not/i);
  });

  it('still lists each pending suggestion in next actions', () => {
    mocks.apps = {
      data: [realApp({ id: 'a1', company: 'Umbrella', suggestion: { id: 's1', proposedStatus: 'Interview', receivedAt: '2026-02-01T00:00:00Z' } })],
      isLoading: false,
    };
    mocks.gmail = { data: gmailStatus({ pendingReviewCount: 1 }) };
    renderDashboard();
    const next = screen.getByRole('heading', { name: 'Next actions' }).closest('section')!;
    const row = within(next).getByRole('link', { name: /Review Gmail update/ });
    expect(row).toHaveAttribute('href', '/app/applications/a1');
    expect(row).toHaveTextContent('An email looks like an interview invite.');
  });
});

describe('Dashboard next actions', () => {
  const nextActions = () => screen.getByRole('heading', { name: 'Next actions' }).closest('section')!;

  it('shows a short all-caught-up line when nothing is known, even for Interview status alone', () => {
    mocks.apps = { data: [realApp({ status: 'Interview' })], isLoading: false };
    mocks.gmail = { data: gmailStatus() };
    renderDashboard();
    expect(nextActions()).toHaveTextContent('You’re all caught up. Nothing needs your attention right now.');
    expect(within(nextActions()).queryByRole('link')).not.toBeInTheDocument();
  });

  it('lists verified upcoming interview and assessment times, never past or closed ones', () => {
    mocks.apps = {
      data: [
        realApp({
          id: 'a1',
          company: 'Hooli',
          status: 'Interview',
          activity: [event({ scheduledAt: inDays(1) }), event({ scheduledAt: inDays(-2) })],
        }),
        realApp({ id: 'a2', company: 'Stark', activity: [event({ eventType: 'assessment', scheduledAt: inDays(5) })] }),
        realApp({ id: 'a3', company: 'Closed Co', status: 'Rejected', activity: [event({ scheduledAt: inDays(2) })] }),
      ],
      isLoading: false,
    };
    mocks.gmail = { data: gmailStatus() };
    renderDashboard();
    const links = within(nextActions()).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Interview');
    expect(links[0]).toHaveTextContent('Tomorrow');
    expect(links[0]).toHaveTextContent('Hooli');
    expect(links[0]).toHaveAttribute('href', '/app/applications/a1');
    expect(links[1]).toHaveTextContent('Assessment due');
    expect(links[1]).toHaveTextContent('In 5 days');
    expect(nextActions()).not.toHaveTextContent('Closed Co');
  });

  it('includes follow-up dates the user set, after Gmail items', () => {
    mocks.apps = {
      data: [
        realApp({ id: 'f1', company: 'Wayne', followUpDate: dateInDays(-1) }),
        realApp({ id: 'f2', company: 'Later Inc', followUpDate: dateInDays(60) }),
      ],
      isLoading: false,
    };
    renderDashboard();
    const row = within(nextActions()).getByRole('link', { name: /Follow up/ });
    expect(row).toHaveTextContent('Overdue');
    expect(row).toHaveTextContent('Wayne');
    expect(nextActions()).not.toHaveTextContent('Later Inc');
  });

  it('does not show stale Gmail suggestions when Gmail is not connected', () => {
    mocks.apps = {
      data: [realApp({ suggestion: { id: 's1', proposedStatus: 'Offer', receivedAt: '2026-02-01T00:00:00Z' } })],
      isLoading: false,
    };
    mocks.gmail = { data: { available: true, pendingReviewCount: 0, connection: { state: 'not_connected' }, sync: null } };
    renderDashboard();
    expect(within(nextActions()).queryByText(/Review Gmail update/)).not.toBeInTheDocument();
  });
});

describe('Dashboard latest AI match', () => {
  beforeEach(() => {
    mocks.apps = { data: [realApp()], isLoading: false };
  });

  it('shows the real latest job, employer and score with one insight and Tailor CV navigation', () => {
    mocks.matches = { data: [match(), match({ id: 'm0', jobTitle: 'Older', company: 'Old Co' })] };
    renderDashboard();
    const card = screen.getByRole('heading', { name: 'Latest AI match' }).closest('section')!;
    expect(within(card).getByRole('link', { name: 'Frontend Engineer' })).toHaveAttribute('href', '/app/match/m1');
    expect(card).toHaveTextContent('Globex');
    expect(within(card).getByRole('progressbar', { name: 'Match score' })).toHaveAttribute('aria-valuenow', '82');
    expect(card).toHaveTextContent('Your CV clearly shows React and TypeScript.');
    expect(card).not.toHaveTextContent('Old Co');
    expect(within(card).getByRole('link', { name: /Tailor my CV for this job/ })).toHaveAttribute(
      'href',
      '/app/match/m1/tailor',
    );
  });

  it('does not show a score the backend marked unavailable', () => {
    mocks.matches = { data: [match({ scoreAvailable: false, score: 0 })] };
    renderDashboard();
    const card = screen.getByRole('heading', { name: 'Latest AI match' }).closest('section')!;
    expect(card).toHaveTextContent('Score unavailable');
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('invites a first match when there is none', () => {
    renderDashboard();
    const card = screen.getByRole('heading', { name: 'Latest AI match' }).closest('section')!;
    expect(within(card).getByRole('link', { name: 'Check a job' })).toHaveAttribute('href', '/app/match');
  });
});
