import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Application, ApplicationPatch } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';
import ApplicationDetailPage from './ApplicationDetailPage';

const mocks = vi.hoisted(() => ({
  app: undefined as Application | undefined,
  cvs: { data: undefined as { id: string; name: string }[] | undefined, isError: false },
  mutateAsync: vi.fn(),
}));

vi.mock('@/shared/api/queries', () => ({
  useApplication: () => ({ data: mocks.app, isLoading: false }),
  useCvs: () => mocks.cvs,
  useUpdateApplication: () => ({ mutateAsync: mocks.mutateAsync }),
  useDeleteApplication: () => ({}),
  useReviewSuggestion: () => ({}),
  useUndoEvent: () => ({}),
}));

beforeEach(() => {
  mocks.app = {
    id: 'app1', company: 'Acme', jobTitle: 'Engineer', status: 'Interview',
    cvId: 'deleted', notes: 'Referral', history: [], suggestion: null, updatedAt: '2025-02-01',
  };
  mocks.cvs = { data: [{ id: 'new', name: 'Replacement CV' }], isError: false };
  mocks.mutateAsync.mockReset().mockImplementation(async ({ id, ...patch }: ApplicationPatch & { id: string }) => {
    if (mocks.app?.id === id) mocks.app = { ...mocks.app, ...patch };
  });
});

function page() {
  return (
    <MemoryRouter initialEntries={['/app/applications/app1']}>
      <ToastProvider>
        <Routes>
          <Route path="/app/applications/:id" element={<ApplicationDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

it('shows the missing attachment alongside historical details and lets the user unlink it', async () => {
  render(page());
  expect(screen.getByText('CV no longer available')).toBeVisible();
  expect(screen.getByText('Referral')).toBeVisible();
  expect(screen.getByRole('heading', { name: /Acme/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Edit attachment' }));
  const modal = within(screen.getByRole('dialog'));
  expect(modal.getByLabelText(/CV you sent/)).toHaveDisplayValue('CV no longer available');
  fireEvent.change(modal.getByLabelText(/CV you sent/), { target: { value: '' } });
  fireEvent.click(modal.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: 'app1', cvId: null }));
  expect(await screen.findByText('Not linked')).toBeVisible();
  expect(screen.getByText('Referral')).toBeVisible();
});

it('does not claim an attached CV is deleted before the owned list loads successfully', () => {
  mocks.cvs = { data: undefined, isError: false };
  const { rerender } = render(page());
  expect(screen.getByText('Loading attached CV…')).toBeVisible();
  expect(screen.queryByText('CV no longer available')).not.toBeInTheDocument();

  mocks.cvs = { data: undefined, isError: true };
  rerender(page());
  expect(screen.getByText('Could not load attached CV')).toBeVisible();
  expect(screen.queryByText('CV no longer available')).not.toBeInTheDocument();
});
