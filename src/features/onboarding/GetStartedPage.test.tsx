import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cv } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';

const mocks = vi.hoisted(() => ({
  register: vi.fn(async () => ({ id: 'u1', name: 'Ada Example', email: 'ada@example.com', createdAt: '' })),
  cvs: { data: [] as Cv[], isLoading: false, isError: false, refetch: vi.fn() },
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Ada Example', email: 'ada@example.com' }, status: 'authenticated',
                    register: mocks.register }),
}));
vi.mock('@/shared/api/queries', () => ({
  useCvs: () => mocks.cvs,
  useProfile: () => ({ data: { experience: [], summary: '' }, isLoading: false }),
  useCreateCv: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useDeleteCv: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCv: () => ({ mutate: vi.fn(), isPending: false }),
  fetchCvPdfBlob: vi.fn(),
}));

vi.mock('@/features/cv/HarvardPdfViewer', () => ({ HarvardPdfViewer: () => <div data-testid="pdf" /> }));

import RegisterPage from '@/features/auth/RegisterPage';
import CvBuilderPage from '@/features/cv/CvBuilderPage';
import MyCvsPage from '@/features/cv/MyCvsPage';
import { pendingJob } from '@/shared/lib/pendingJob';
import GetStartedPage from './GetStartedPage';

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/app/welcome" element={<GetStartedPage />} />
            <Route path="/app/cvs" element={<MyCvsPage />} />
            <Route path="/app/cv-builder" element={<CvBuilderPage />} />
            <Route path="/app/cvs/import" element={<p>IMPORT PAGE</p>} />
            <Route path="/app" element={<p>DASHBOARD</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.cvs.data = [];
});
afterEach(() => cleanup());

describe('after registration', () => {
  it('offers the optional first step instead of going straight to the dashboard', async () => {
    renderAt('/register');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada Example' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Sufficiently-long-9' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
    expect(await screen.findByRole('heading', { name: 'Welcome to FlowJob, Ada' })).toBeVisible();
    expect(mocks.register).toHaveBeenCalledOnce();
  });

  it.each([
    ['Import my existing CV', 'IMPORT PAGE'],
    ['Create my CV manually', 'Let’s make your first CV'],
    ['Skip for now', 'DASHBOARD'],
  ])('"%s" leads to the right place', async (choice, destination) => {
    renderAt('/app/welcome');
    fireEvent.click(screen.getByRole('link', { name: new RegExp(choice) }));
    expect(await screen.findByText(destination)).toBeVisible();
  });

  it('mentions a job post saved before signing up', () => {
    pendingJob.set('Junior Developer at Example Ltd');
    renderAt('/app/welcome');
    expect(screen.getByText(/job post you saved is waiting/)).toBeVisible();
  });
});

describe('Import CV entry points', () => {
  it('appears in My CVs when there are no CVs and when there are some', () => {
    renderAt('/app/cvs');
    expect(screen.getAllByRole('link', { name: 'Import CV' }).every((l) => l.getAttribute('href') === '/app/cvs/import'))
      .toBe(true);
    cleanup();
    mocks.cvs.data = [{ id: 'cv1', name: 'Original CV', kind: 'original', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      content: { fullName: '', email: '', phone: '', location: '', links: [], summary: '', experience: [],
                 education: [], projects: [], skills: [], languages: '' } }];
    renderAt('/app/cvs');
    expect(screen.getByRole('link', { name: 'Import CV' })).toHaveAttribute('href', '/app/cvs/import');
  });

  it('appears in the empty CV Builder', () => {
    renderAt('/app/cv-builder');
    expect(screen.getByRole('link', { name: 'Import CV (PDF)' })).toHaveAttribute('href', '/app/cvs/import');
  });
});
