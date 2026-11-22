import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Link, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/Overlay';
import { guardedRouter, unload } from '@/test/guardedRouter';

const mocks = vi.hoisted(() => ({
  updateMe: { mutate: vi.fn(), isPending: false },
  change: { mutate: vi.fn(), isPending: false },
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { name: 'Ana Nowak', email: 'ana@example.com' }, setUser: vi.fn() }),
}));
vi.mock('@/shared/api/queries', () => ({
  useUpdateMe: () => mocks.updateMe,
  useChangePassword: () => mocks.change,
}));
vi.mock('@/shared/lib/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('@/features/applications/gmail/GmailSettingsCard', () => ({ GmailSettingsCard: () => <p>GMAIL CARD</p> }));

import SettingsPage from './SettingsPage';

afterEach(cleanup);

function renderSettings() {
  const router = guardedRouter([{
    element: <ToastProvider><Outlet /><Link to="/app/cvs">Sidebar: My CVs</Link></ToastProvider>,
    children: [
      { path: '/app/settings', element: <SettingsPage /> },
      { path: '/app/cvs', element: <p>MY CVS</p> },
    ],
  }], ['/app/settings']);
  render(<RouterProvider router={router} />);
  return router;
}
const sidebar = () => fireEvent.click(screen.getByRole('link', { name: 'Sidebar: My CVs' }));

it('does not ask while the account is unchanged', () => {
  renderSettings();
  expect(unload()).toBe(true);
  sidebar();
  expect(screen.getByText('MY CVS')).toBeInTheDocument();
});

it('asks before unsaved account changes are lost', () => {
  const router = renderSettings();
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ana Kowalska' } });
  expect(unload()).toBe(false);
  sidebar();
  const ask = screen.getByRole('dialog', { name: 'Leave without saving?' });
  expect(ask).toHaveTextContent('Your account changes have not been saved.');
  fireEvent.click(within(ask).getByRole('button', { name: 'Stay' }));
  expect(router.state.location.pathname).toBe('/app/settings');
  expect(screen.getByLabelText('Full name')).toHaveValue('Ana Kowalska');
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ana Nowak' } }); // back to the saved value
  expect(unload()).toBe(true);
});

it('asks before closing the password dialog with a typed password, and not when it is empty', () => {
  renderSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Change password' })).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  const pw = within(screen.getByRole('dialog', { name: 'Change password' }));
  fireEvent.change(pw.getByLabelText('Current password'), { target: { value: 'old-secret' } });
  fireEvent.keyDown(document, { key: 'Escape' });
  const ask = screen.getByRole('dialog', { name: 'Discard the password change?' });
  fireEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }));
  expect(pw.getByLabelText('Current password')).toHaveValue('old-secret');
  fireEvent.click(pw.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mocks.change.mutate).not.toHaveBeenCalled();
});
