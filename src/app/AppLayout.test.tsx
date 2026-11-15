import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(() => Promise.resolve()),
  toggle: vi.fn(),
  theme: 'light' as 'light' | 'dark',
  navigate: vi.fn(),
  gmail: undefined as { pendingReviewCount: number } | undefined,
}));

vi.mock('@/shared/api/queries', () => ({ useApplications: () => ({ data: [] }),
  useGmail: () => ({ data: mocks.gmail }) }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { name: 'Jordan Verylongname Example', email: 'jordan.verylong@example.com' }, logout: mocks.logout }),
}));
vi.mock('@/shared/lib/theme', () => ({ useTheme: () => ({ theme: mocks.theme, toggle: mocks.toggle }) }));
vi.mock('react-router-dom', async (orig) => {
  const actual = (await orig()) as typeof import('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

import { AppLayout } from './AppLayout';
import { ToastProvider } from '@/shared/ui/Overlay';

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <ToastProvider>
        <Routes>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<div>home</div>} />
          </Route>
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  mocks.logout = vi.fn(() => Promise.resolve());
  mocks.toggle = vi.fn();
  mocks.navigate = vi.fn();
  mocks.theme = 'light';
  mocks.gmail = undefined;
});

describe('AppLayout sidebar + account menu', () => {
  it('shows the number of pending Gmail suggestions beside Applications', () => {
    mocks.gmail = { pendingReviewCount: 3 };
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByLabelText('3 to review')).toHaveTextContent('3');
    cleanup();
    mocks.gmail = { pendingReviewCount: 0 };
    renderLayout();
    expect(screen.queryByLabelText(/to review/)).toBeNull();
  });

  it('shows exactly the five core nav links and not Profile/Settings in the main nav', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Dashboard', 'CV Builder', 'My CVs', 'Job Match', 'Applications']) {
      expect(within(nav).getByText(label)).toBeTruthy();
    }
    expect(within(nav).queryByText('Profile')).toBeNull();
    expect(within(nav).queryByText('Settings')).toBeNull();
  });

  it('opens the account menu with Profile, Settings, Dark mode and Log out', () => {
    renderLayout();
    const trigger = screen.getByRole('button', { name: /Account menu/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu', { name: 'Account' });
    expect(within(menu).getByText('My Profile')).toBeTruthy();
    expect(within(menu).getByText('Account Settings')).toBeTruthy();
    expect(within(menu).getByText('Dark mode')).toBeTruthy();
    expect(within(menu).getByText('Log out')).toBeTruthy();
  });

  it('navigates to Profile and Settings from the menu', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
    fireEvent.click(screen.getByText('My Profile'));
    expect(mocks.navigate).toHaveBeenCalledWith('/app/profile');
    fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
    fireEvent.click(screen.getByText('Account Settings'));
    expect(mocks.navigate).toHaveBeenCalledWith('/app/settings');
  });

  it('closes on Escape', () => {
    renderLayout();
    const trigger = screen.getByRole('button', { name: /Account menu/i });
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('supports arrow-key navigation between menu items', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
    const menu = screen.getByRole('menu');
    expect(document.activeElement?.textContent).toContain('My Profile'); // first item focused
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Account Settings');
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toContain('My Profile');
  });

  it('toggles dark mode via the existing theme system', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Dark mode/i }));
    expect(mocks.toggle).toHaveBeenCalledTimes(1);
  });

  it('logs out through the existing auth flow', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
    fireEvent.click(screen.getByText('Log out'));
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });
});
