import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Outlet, Route, RouterProvider, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application, ApplicationPatch } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';
import { guardedRouter, unload } from '@/test/guardedRouter';
import ApplicationDetailPage from './ApplicationDetailPage';

const mocks = vi.hoisted(() => ({
  app: undefined as Application | undefined,
  cvs: { data: undefined as { id: string; name: string }[] | undefined, isError: false },
  mutateAsync: vi.fn(),
  del: { mutate: vi.fn(), isPending: false },
}));

vi.mock('@/shared/api/queries', () => ({
  useApplication: () => ({ data: mocks.app, isLoading: false }),
  useCvs: () => mocks.cvs,
  useUpdateApplication: () => ({ mutateAsync: mocks.mutateAsync }),
  useDeleteApplication: () => mocks.del,
  useApproveReview: () => ({}),
  useDismissReview: () => ({}),
  useCorrectActivity: () => ({}),
  useDismissActivity: () => ({}),
}));

beforeEach(() => {
  mocks.app = {
    id: 'app1', company: 'Acme', jobTitle: 'Engineer', status: 'Interview',
    cvId: 'deleted', notes: 'Referral', history: [], suggestion: null, updatedAt: '2025-02-01',
  };
  mocks.cvs = { data: [{ id: 'new', name: 'Replacement CV' }], isError: false };
  mocks.del = { mutate: vi.fn(), isPending: false };
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
          <Route path="/app/applications" element={<p>APPLICATIONS LIST</p>} />
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

it('offers Delete only inside Edit details; cancelling the confirmation deletes and saves nothing', async () => {
  render(page());
  expect(screen.queryByRole('button', { name: 'Delete application' })).toBeNull(); // no link on the page
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
  const edit = screen.getByRole('dialog', { name: 'Edit details' });
  fireEvent.change(within(edit).getByLabelText(/Job title/), { target: { value: 'Unsaved title' } });
  const del = within(edit).getByRole('button', { name: 'Delete application' });
  // Below the form's own actions, after the divider.
  const save = within(edit).getByRole('button', { name: 'Save changes' });
  expect(save.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(del);

  expect(screen.queryByRole('dialog', { name: 'Edit details' })).toBeNull();
  const confirm = screen.getByRole('dialog', { name: 'Delete Acme?' });
  expect(within(confirm).getByText(/This cannot be undone/)).toBeVisible();
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mocks.del.mutate).not.toHaveBeenCalled();
  expect(mocks.mutateAsync).not.toHaveBeenCalled();
  expect(screen.queryByText(/Unsaved title/)).toBeNull(); // the edit was not saved

  // Reopening Edit details starts from the saved values.
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
  expect(within(screen.getByRole('dialog', { name: 'Edit details' })).getByLabelText(/Job title/)).toHaveDisplayValue('Engineer');
});

it('deletes after confirmation and returns to Applications', async () => {
  mocks.del.mutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
  render(page());
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Edit details' })).getByRole('button', { name: 'Delete application' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete Acme?' })).getByRole('button', { name: 'Delete' }));
  expect(mocks.del.mutate).toHaveBeenCalledWith('app1', expect.anything());
  expect(await screen.findByText('APPLICATIONS LIST')).toBeVisible();
  expect(screen.getByText('Acme deleted.')).toBeVisible();
});

describe('Edit details with unsaved changes', () => {
  function renderGuarded() {
    const router = guardedRouter([{
      element: <ToastProvider><Outlet /><Link to="/app/applications">Sidebar: Applications</Link></ToastProvider>,
      children: [
        { path: '/app/applications/:id', element: <ApplicationDetailPage /> },
        { path: '/app/applications', element: <p>APPLICATIONS LIST</p> },
      ],
    }], ['/app/applications/app1']);
    render(<RouterProvider router={router} />);
  }
  const edit = () => {
    fireEvent.click(screen.getAllByRole('button', { name: /Edit details/ })[0]);
    return within(screen.getByRole('dialog', { name: 'Edit details' }));
  };

  it('closes an untouched dialog at once', () => {
    renderGuarded();
    fireEvent.click(edit().getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(unload()).toBe(true);
  });

  it('asks before Cancel, Escape or leaving the page drops changes, and never after saving', async () => {
    renderGuarded();
    const form = edit();
    fireEvent.change(form.getByLabelText(/Notes/), { target: { value: 'Call back on Friday' } });
    await waitFor(() => expect(unload()).toBe(false));
    fireEvent.keyDown(document, { key: 'Escape' });
    const ask = screen.getByRole('dialog', { name: 'Discard your changes?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }));
    expect(form.getByLabelText(/Notes/)).toHaveValue('Call back on Friday');

    fireEvent.click(screen.getByRole('link', { name: 'Sidebar: Applications' }));
    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    fireEvent.click(form.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit details' })).toBeNull());
    expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).toBeNull();
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: 'app1', notes: 'Call back on Friday' });
    expect(unload()).toBe(true);
  });
});
