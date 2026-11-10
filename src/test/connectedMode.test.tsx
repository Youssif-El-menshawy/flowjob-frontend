import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AddApplicationPage from '@/features/applications/AddApplicationPage';
import ApplicationDetailPage from '@/features/applications/ApplicationDetailPage';
import ForgotPasswordPage from '@/features/auth/ForgotPasswordPage';
import LoginPage from '@/features/auth/LoginPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import LandingPage from '@/features/landing/LandingPage';
import SettingsPage from '@/features/settings/SettingsPage';
import type { Application, GmailConnection } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';

const mocks = vi.hoisted(() => ({
  demo: false,
  setUser: vi.fn(),
  logout: vi.fn(async () => {}),
}));

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/shared/api/client')>(),
  get USE_MOCKS() { return mocks.demo; },
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Fixture User', email: 'fixture@example.test' },
    status: 'authenticated',
    setUser: mocks.setUser,
    logout: mocks.logout,
  }),
}));

const application: Application = {
  id: 'app1',
  company: 'Acme',
  jobTitle: 'Engineer',
  status: 'Applied',
  createdAt: '2026-01-01',
  updatedAt: '2026-02-01',
  history: [
    { id: 'e1', at: '2026-01-01', status: 'Saved', source: 'manual' },
    { id: 'e2', at: '2026-02-01', status: 'Applied', source: 'manual' },
  ],
  suggestion: {
    id: 's1',
    proposedStatus: 'Interview',
    from: 'careers@example.test',
    receivedAt: '2026-02-01',
    snippet: 'Can we set up an interview?',
  },
};

const disconnected: GmailConnection = { connected: false, autoSync: true, updatesThisMonth: 0 };
const connected: GmailConnection = { ...disconnected, connected: true, email: 'fixture@example.test' };
const unavailable = () => Response.json({ message: 'Service unavailable' }, { status: 503 });

function stubBackend(override?: (path: string, method: string) => Response | Promise<Response> | undefined) {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url, 'https://fixture.test').pathname.replace(/^\/api\/v1/, '');
    const method = init.method ?? 'GET';
    requests.push(`${method} ${path}`);
    const response = override?.(path, method);
    if (response) return response;
    if (path === '/applications') return Response.json([application]);
    if (path === '/applications/app1') return Response.json(application);
    if (path === '/cvs') return Response.json([{ id: 'cv1', name: 'My CV' }]);
    if (path === '/matches') return Response.json([]);
    if (path === '/profile') return Response.json(null);
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  }));
  return requests;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/app" element={<DashboardPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
            <Route path="/app/applications/new" element={<AddApplicationPage />} />
            <Route path="/app/applications/:id" element={<ApplicationDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.demo = false;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('keeps the connected reset URL navigable without offering or requesting a reset', () => {
  const requests = stubBackend();
  renderAt('/forgot-password');

  expect(screen.getByText(/password reset is currently unavailable/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Back to log in' }));
  expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument();
  expect(requests).toEqual([]);
});

it('shows connected settings notices without fetching Gmail, and still saves account details', async () => {
  const requests = stubBackend((path, method) => path === '/me' && method === 'PATCH'
    ? Response.json({ id: 'u1', name: 'Updated User', email: 'fixture@example.test' })
    : undefined);
  renderAt('/app/settings');

  expect(screen.getByText(/data export and account deletion are currently unavailable/i)).toBeVisible();
  expect(screen.getByText(/gmail integration is currently unavailable/i)).toBeVisible();
  expect(screen.queryByRole('status', { name: 'Loading Gmail settings' })).not.toBeInTheDocument();
  for (const name of ['Download my data', 'Delete account', 'Connect Gmail']) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
  expect(screen.getByRole('button', { name: 'Change password' })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Updated User' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Account updated.')).toBeVisible();
  expect(requests).toEqual(['PATCH /me']);
});

it('keeps connected application actions available without offering demo Gmail review or undo', async () => {
  const requests = stubBackend();
  const dashboard = renderAt('/app');
  const app = await screen.findByRole('link', { name: /Acme/ });
  expect(screen.queryByRole('link', { name: 'Gmail settings' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Move to Interview' })).not.toBeInTheDocument();

  fireEvent.click(app);
  expect(await screen.findByRole('heading', { name: /Acme/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Not right' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change status' })).toBeEnabled();
  expect(screen.getByRole('heading', { name: 'History' })).toBeVisible();
  expect(requests).toContain('GET /applications/app1');
  expect(requests.filter((request) => /gmail|suggestion|undo/.test(request))).toEqual([]);

  dashboard.unmount();
  renderAt('/app/applications/new');
  expect(await screen.findByRole('heading', { name: 'Add an application' })).toBeVisible();
  expect(screen.queryByText('How Gmail helps')).not.toBeInTheDocument();
});

it('advertises only supported application tracking on the connected landing page', () => {
  const requests = stubBackend();
  renderAt('/');

  expect(screen.getByText(/track each application and update its status/i)).toBeVisible();
  expect(screen.queryByText(/gmail/i)).not.toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Open dashboard' })[0]).toHaveAttribute('href', '/app');
  expect(requests).toEqual([]);
});

it('replaces the demo Gmail loader with an error, retries and still supports connecting', async () => {
  mocks.demo = true;
  let resolveLoad!: (response: Response) => void;
  const initialLoad = new Promise<Response>((resolve) => { resolveLoad = resolve; });
  const loads = vi.fn().mockReturnValueOnce(initialLoad).mockImplementation(() => Response.json(disconnected));
  const connects = vi.fn().mockImplementationOnce(unavailable).mockImplementation(() => Response.json(connected));
  const requests = stubBackend((path, method) => {
    if (path === '/gmail' && method === 'GET') return loads();
    if (path === '/gmail/connect' && method === 'POST') return connects();
  });
  renderAt('/app/settings');

  expect(screen.getByRole('status', { name: 'Loading Gmail settings' })).toBeVisible();
  resolveLoad(unavailable());
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load Gmail settings.');
  expect(screen.queryByRole('status', { name: 'Loading Gmail settings' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Connect Gmail' }));
  expect(await screen.findByText('Could not connect Gmail. Try again.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Connect Gmail' }));
  expect(await screen.findByText('Connected · fixture@example.test')).toBeVisible();
  expect(requests).toEqual(['GET /gmail', 'GET /gmail', 'POST /gmail/connect', 'POST /gmail/connect']);
});

it('keeps demo password recovery available and handles a failed request without claiming an email was sent', async () => {
  mocks.demo = true;
  const reset = vi.fn().mockImplementationOnce(unavailable).mockImplementation(() => new Response(null, { status: 204 }));
  const requests = stubBackend((path) => path === '/auth/forgot-password' ? reset() : undefined);
  renderAt('/login');

  fireEvent.click(screen.getByRole('link', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'fixture@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete the demo reset request.');
  expect(screen.getByLabelText('Email address')).toHaveValue('fixture@example.test');
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByRole('heading', { name: 'Demo request complete.' })).toBeVisible();
  expect(screen.getByText(/no email was sent/i)).toBeVisible();
  expect(requests).toEqual(['POST /auth/forgot-password', 'POST /auth/forgot-password']);
});

it('shows demo data action errors and only logs out after a successful confirmed deletion', async () => {
  mocks.demo = true;
  const deleteAccount = vi.fn().mockImplementationOnce(unavailable)
    .mockImplementation(() => new Response(null, { status: 204 }));
  const requests = stubBackend((path, method) => {
    if (path === '/gmail') return Response.json(disconnected);
    if (path === '/me/export') return unavailable();
    if (path === '/me' && method === 'DELETE') return deleteAccount();
  });
  renderAt('/app/settings');

  fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
  expect(await screen.findByText('Could not download your data. Try again.')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete your account?' });
  expect(requests).not.toContain('DELETE /me');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
  expect(await screen.findByText('Could not delete your account. Try again.')).toBeVisible();
  expect(mocks.logout).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
  await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('heading', { name: 'Every application, one step closer.' })).toBeVisible();
  expect(requests.filter((request) => request === 'DELETE /me')).toHaveLength(2);
});
