import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cv } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';

// Where setup starts: registration leads straight to the Dashboard, and CV pages never import a PDF into a new CV.
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

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/app/cvs" element={<MyCvsPage />} />
            <Route path="/app/cv-builder" element={<CvBuilderPage />} />
            <Route path="/app" element={<p>DASHBOARD</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.cvs.data = [];
});
afterEach(() => cleanup());

describe('after registration', () => {
  it('goes straight to the Dashboard, where setup starts', async () => {
    renderAt('/register');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada Example' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Sufficiently-long-9' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
    expect(await screen.findByText('DASHBOARD')).toBeVisible();
    expect(mocks.register).toHaveBeenCalledOnce();
  });
});

describe('CV pages do not import into a new CV', () => {
  it('My CVs has no import button, with or without CVs', () => {
    renderAt('/app/cvs');
    expect(screen.queryByRole('link', { name: /Import/ })).not.toBeInTheDocument();
    cleanup();
    mocks.cvs.data = [{ id: 'cv1', name: 'Original CV', kind: 'original', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      content: { fullName: '', email: '', phone: '', location: '', links: [], summary: '', experience: [],
                 education: [], projects: [], skills: [], languages: '' } }];
    renderAt('/app/cvs');
    expect(screen.queryByRole('link', { name: /Import/ })).not.toBeInTheDocument();
  });

  it('the empty CV Builder creates the CV from the Profile, not from a PDF', () => {
    renderAt('/app/cv-builder');
    expect(screen.queryByRole('link', { name: /Import/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start my CV' })).toBeVisible();
  });
});
