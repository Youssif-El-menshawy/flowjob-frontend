import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { useLeaveGuard } from '@/shared/ui/LeaveGuard';
import { ToastProvider } from '@/shared/ui/Overlay';
import { guardedRouter } from '@/test/guardedRouter';

const mocks = vi.hoisted(() => ({ logout: vi.fn(), signedIn: true }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { name: 'Ana Nowak', email: 'ana@example.com' }, logout: mocks.logout }),
}));
vi.mock('@/shared/lib/theme', () => ({ useTheme: () => ({ theme: 'light', toggle: vi.fn() }) }));

import { AccountMenu } from './AccountMenu';

afterEach(() => {
  cleanup();
  mocks.logout.mockReset();
});

/** A page with an unsaved Profile-like edit, and the account menu beside it as in the sidebar. */
function Page() {
  const [name, setName] = useState('');
  useLeaveGuard({ when: !!name, title: 'Leave profile?', message: 'Your unsaved profile changes will be lost if you leave.' });
  return (
    <>
      <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <AccountMenu />
    </>
  );
}

function renderMenu() {
  const router = guardedRouter([
    { path: '/app/profile', element: <Page /> },
    { path: '/', element: <h1>Landing</h1> },
  ], ['/app/profile']);
  render(<ToastProvider><RouterProvider router={router} /></ToastProvider>);
  return router;
}
const logOut = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Log out/ }));
};

it('logs out at once when nothing is unsaved', async () => {
  mocks.logout.mockResolvedValue(undefined);
  const router = renderMenu();
  logOut();
  await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  expect(mocks.logout).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('asks before ending the session with unsaved edits; Stay keeps the session and the edits', async () => {
  mocks.logout.mockResolvedValue(undefined);
  const router = renderMenu();
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Unsaved name' } });
  logOut();
  const ask = screen.getByRole('dialog', { name: 'Log out?' });
  expect(ask).toHaveTextContent('Your unsaved profile changes will be lost if you leave.');
  expect(mocks.logout).not.toHaveBeenCalled(); // nothing has ended yet

  fireEvent.click(within(ask).getByRole('button', { name: 'Stay' }));
  expect(mocks.logout).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Full name')).toHaveValue('Unsaved name');
  expect(router.state.location.pathname).toBe('/app/profile');

  logOut();
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Log out?' })).getByRole('button', { name: 'Log out' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  expect(mocks.logout).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).toBeNull(); // the navigation after logging out is never asked about again
});

it('keeps the page and its protection when logging out fails', async () => {
  mocks.logout.mockRejectedValue(new Error('offline'));
  const router = renderMenu();
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Unsaved name' } });
  logOut();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log out' }));
  expect(await screen.findByText('Could not log out. Please try again.')).toBeVisible();
  expect(router.state.location.pathname).toBe('/app/profile');
  logOut();
  expect(screen.getByRole('dialog', { name: 'Log out?' })).toBeInTheDocument();
});
