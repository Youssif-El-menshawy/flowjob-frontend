import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application, ApplicationStatus } from '@/shared/api/types';
import { STATUSES } from '@/shared/api/types';

// Mutable query-hook results, configured per test. Mocking the query module keeps the
// Dashboard pure-render so we can prove it never crashes on real-shaped application data.
const completeProfile = {
  fullName: 'A', email: 'a@x.com', phone: '', location: 'NYC', links: [], summary: 'x'.repeat(40),
  experience: [{ id: '0' }], education: [{ id: '0' }], projects: [], skills: ['a', 'b', 'c', 'd'], languages: '',
};

const mocks = vi.hoisted(() => ({
  apps: { data: [] as Application[] | undefined, isLoading: false, isError: false },
  cvs: { data: [{ id: 'cv1', name: 'My CV' }] as { id: string; name: string }[] | undefined },
  profile: { data: undefined as unknown },
}));

vi.mock('@/shared/api/queries', () => ({
  useApplications: () => mocks.apps,
  useCvs: () => mocks.cvs,
  useMatches: () => ({ data: [] }),
  useGmail: () => ({ data: undefined }),
  useProfile: () => mocks.profile,
  useReviewSuggestion: () => ({ mutate: () => {}, isPending: false, variables: undefined }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { name: 'Test User' } }) }));

import DashboardPage from './DashboardPage';
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

function renderDashboard() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DashboardPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('DashboardPage (regression: must never blank-crash)', () => {
  it('renders with zero applications', () => {
    mocks.apps = { data: [], isLoading: false, isError: false };
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
    mocks.apps = {
      data: STATUSES.map((s: ApplicationStatus) => realApp({ status: s })),
      isLoading: false,
      isError: false,
    };
    const { container } = renderDashboard();
    expect(container.textContent).toContain('stand'); // "Where your N applications stand"
  });

  it('renders applications missing dates, notes and linked CVs', () => {
    mocks.apps = {
      data: [
        realApp({ status: 'Interview', dateApplied: undefined, notes: undefined, cvId: undefined }),
        realApp({ status: 'Offer' }),
      ],
      isLoading: false,
      isError: false,
    };
    expect(() => renderDashboard()).not.toThrow();
  });

  it('renders during the loading state', () => {
    mocks.apps = { data: undefined, isLoading: true, isError: false };
    expect(() => renderDashboard()).not.toThrow();
  });

  it('renders on an API error (no data)', () => {
    mocks.apps = { data: undefined, isLoading: false, isError: true };
    mocks.cvs = { data: [{ id: 'cv1', name: 'My CV' }] };
    expect(() => renderDashboard()).not.toThrow();
  });

  it('shows "Complete your profile" onboarding when the profile is incomplete', () => {
    mocks.apps = { data: [], isLoading: false, isError: false }; // new user → onboarding visible
    mocks.profile = { data: { ...completeProfile, skills: [] } }; // incomplete (no skills)
    const { container } = renderDashboard();
    expect(container.textContent).toContain('Complete your profile');
  });

  it('hides the profile step once the profile is complete', () => {
    mocks.apps = { data: [], isLoading: false, isError: false };
    mocks.profile = { data: completeProfile };
    const { container } = renderDashboard();
    expect(container.textContent).not.toContain('Complete your profile');
    expect(container.textContent).toContain('Create your CV'); // other steps remain
  });
});
