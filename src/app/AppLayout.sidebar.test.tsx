import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIDEBAR_KEY } from '@/shared/lib/sidebar';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(() => Promise.resolve()),
  toggleTheme: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/shared/api/queries', () => ({ useApplications: () => ({ data: [] }),
  useGmail: () => ({ data: undefined }) }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { name: 'Jordan Verylongname Example', email: 'jordan.verylong@example.com' },
    logout: mocks.logout,
  }),
}));
vi.mock('@/shared/lib/theme', () => ({ useTheme: () => ({ theme: 'light', toggle: mocks.toggleTheme }) }));
vi.mock('react-router-dom', async (orig) => {
  const actual = (await orig()) as typeof import('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

import { AppLayout } from './AppLayout';
import { ToastProvider } from '@/shared/ui/Overlay';

const DESTINATIONS: [string, string][] = [
  ['Dashboard', '/app'],
  ['CV Builder', '/app/cv-builder'],
  ['My CVs', '/app/cvs'],
  ['Job Match', '/app/match'],
  ['Applications', '/app/applications'],
];

function Tree({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<div>home</div>} />
            <Route path="cvs" element={<div>cvs page</div>} />
            <Route path="cv-builder" element={<div>builder page</div>} />
            <Route path="match" element={<div>match page</div>} />
            <Route path="applications" element={<div>apps page</div>} />
          </Route>
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}
const renderLayout = (path = '/app') => render(<Tree path={path} />);

const desktopAside = () => document.getElementById('app-sidebar') as HTMLElement;
const toggleBtn = () => screen.getByRole('button', { name: /(Collapse|Expand) sidebar/i });
const mainNav = () => within(desktopAside()).getByRole('navigation', { name: 'Main' });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  mocks.navigate = vi.fn();
  mocks.logout = vi.fn(() => Promise.resolve());
  mocks.toggleTheme = vi.fn();
});

describe('collapsible sidebar — toggle', () => {
  it('defaults to expanded for users with no stored preference (and writes nothing yet)', () => {
    renderLayout();
    expect(desktopAside()).toHaveAttribute('data-collapsed', 'false');
    expect(desktopAside().className).toContain('w-[248px]');
    expect(toggleBtn()).toHaveAccessibleName('Collapse sidebar');
    expect(toggleBtn()).toHaveAttribute('aria-expanded', 'true');
    expect(toggleBtn()).toHaveAttribute('aria-controls', 'app-sidebar');
    expect(localStorage.getItem(SIDEBAR_KEY)).toBeNull();
  });

  it('collapses to a ~72px icon rail and expands again', () => {
    renderLayout();
    fireEvent.click(toggleBtn());
    expect(desktopAside()).toHaveAttribute('data-collapsed', 'true');
    expect(desktopAside().className).toContain('w-[72px]');
    expect(toggleBtn()).toHaveAccessibleName('Expand sidebar');
    expect(toggleBtn()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggleBtn());
    expect(desktopAside()).toHaveAttribute('data-collapsed', 'false');
    expect(desktopAside().className).toContain('w-[248px]');
    expect(toggleBtn()).toHaveAccessibleName('Collapse sidebar');
  });

  it('keeps visible text labels when expanded and hides them (visually) when collapsed', () => {
    renderLayout();
    const link = () => within(mainNav()).getByRole('link', { name: 'Dashboard' });
    expect(link().querySelector('.sr-only')).toBeNull(); // label is visible text
    expect(within(link()).getByText('Dashboard').className).toContain('flex-1');
    fireEvent.click(toggleBtn());
    // Collapsed: the label stays in the DOM as the accessible name, but is visually hidden.
    expect(link().querySelector('.sr-only')?.textContent).toBe('Dashboard');
  });
});

describe('collapsible sidebar — navigation', () => {
  it.each([false, true])('keeps all five destinations reachable (collapsed=%s)', (collapsed) => {
    if (collapsed) localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    const links = within(mainNav()).getAllByRole('link');
    expect(links).toHaveLength(5);
    for (const [label, href] of DESTINATIONS) {
      // The accessible name is the same in both states (sr-only label when collapsed).
      expect(within(mainNav()).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it.each([false, true])('highlights the active page in both states (collapsed=%s)', (collapsed) => {
    if (collapsed) localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout('/app/cvs');
    const active = within(mainNav()).getByRole('link', { name: 'My CVs' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toContain('bg-surface');
    const inactive = within(mainNav()).getByRole('link', { name: 'Dashboard' });
    expect(inactive).not.toHaveAttribute('aria-current');
    expect(inactive.className).not.toContain('shadow-');
  });

  it('only highlights Dashboard on exactly /app (not on child pages)', () => {
    renderLayout('/app/match');
    expect(within(mainNav()).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(within(mainNav()).getByRole('link', { name: 'Job Match' })).toHaveAttribute('aria-current', 'page');
  });

  it('gives collapsed icons a tooltip (hover/focus) and a native title', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    const link = within(mainNav()).getByRole('link', { name: 'Job Match' });
    expect(link).toHaveAttribute('title', 'Job Match');
    const tip = link.querySelector('[aria-hidden="true"].opacity-0');
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toBe('Job Match');
    expect(tip!.className).toContain('group-hover:opacity-100');
    expect(tip!.className).toContain('group-focus-visible:opacity-100');
  });

  it('navigates normally from the collapsed rail', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    fireEvent.click(within(mainNav()).getByRole('link', { name: 'Applications' }));
    expect(screen.getByText('apps page')).toBeInTheDocument();
    expect(within(mainNav()).getByRole('link', { name: 'Applications' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('collapsible sidebar — persistence', () => {
  it('stores the preference under one consistent key', () => {
    renderLayout();
    fireEvent.click(toggleBtn());
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('true');
    expect(SIDEBAR_KEY).toBe('flowjob.sidebarCollapsed');
    fireEvent.click(toggleBtn());
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('false');
  });

  it('restores the collapsed state after a remount / refresh', () => {
    const first = renderLayout();
    fireEvent.click(toggleBtn());
    first.unmount();
    renderLayout(); // a fresh mount, like a page refresh
    expect(desktopAside()).toHaveAttribute('data-collapsed', 'true');
    expect(toggleBtn()).toHaveAttribute('aria-expanded', 'false');
  });

  it('restores the expanded state too', () => {
    localStorage.setItem(SIDEBAR_KEY, 'false');
    renderLayout();
    expect(desktopAside()).toHaveAttribute('data-collapsed', 'false');
  });

  it('treats unexpected stored values as expanded', () => {
    localStorage.setItem(SIDEBAR_KEY, 'banana');
    renderLayout();
    expect(desktopAside()).toHaveAttribute('data-collapsed', 'false');
  });

  it('still works when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderLayout();
    expect(desktopAside()).toHaveAttribute('data-collapsed', 'false');
    fireEvent.click(toggleBtn());
    expect(desktopAside()).toHaveAttribute('data-collapsed', 'true'); // works for this session
  });

  it('follows changes made in another tab', () => {
    renderLayout();
    fireEvent(window, new StorageEvent('storage', { key: SIDEBAR_KEY, newValue: 'true' }));
    expect(desktopAside()).toHaveAttribute('data-collapsed', 'true');
  });
});

describe('collapsible sidebar — main content layout', () => {
  it('lets the content cap grow when collapsed and return when expanded', () => {
    renderLayout();
    const inner = () => document.querySelector('#main > div') as HTMLElement;
    expect(inner().className).toContain('max-w-[1120px]');
    expect(inner().className).not.toContain('lg:max-w-[1296px]');
    fireEvent.click(toggleBtn());
    expect(inner().className).toContain('lg:max-w-[1296px]');
    fireEvent.click(toggleBtn());
    expect(inner().className).not.toContain('lg:max-w-[1296px]');
  });

  it('keeps the main region flexible (flex-1 / min-w-0) so it takes the freed width without overflow', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    const main = document.getElementById('main')!;
    expect(main.className).toContain('flex-1');
    expect(main.className).toContain('min-w-0');
  });
});

describe('collapsible sidebar — account menu', () => {
  it('shows only the avatar in collapsed mode, still clickable, with an accessible name', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    const trigger = within(desktopAside()).getByRole('button', { name: /Account menu/i });
    expect(within(trigger).getByText('JV')).toBeInTheDocument(); // initials avatar
    expect(within(trigger).queryByText('Jordan Verylongname Example')).toBeNull();
    expect(within(trigger).queryByText('jordan.verylong@example.com')).toBeNull();
    expect(trigger).toHaveAttribute('title', expect.stringContaining('Jordan Verylongname Example'));
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('opens the same menu (Profile, Settings, Dark mode, Log out) from the collapsed rail', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    fireEvent.click(within(desktopAside()).getByRole('button', { name: /Account menu/i }));
    const menu = screen.getByRole('menu', { name: 'Account' });
    for (const t of ['My Profile', 'Account Settings', 'Dark mode', 'Log out'])
      expect(within(menu).getByText(t)).toBeInTheDocument();
    // Wider than the 72px rail, so it cannot be clipped by it; opens upward from the avatar.
    expect(menu.className).toContain('w-60');
    expect(menu.className).toContain('bottom-full');
  });

  it('keeps the menu full-width of the sidebar when expanded', () => {
    renderLayout();
    fireEvent.click(within(desktopAside()).getByRole('button', { name: /Account menu/i }));
    expect(screen.getByRole('menu').className).toContain('w-full');
  });

  it('keeps working in collapsed mode: navigate, theme, logout, Escape', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    const open = () => fireEvent.click(within(desktopAside()).getByRole('button', { name: /Account menu/i }));
    open();
    fireEvent.click(screen.getByText('My Profile'));
    expect(mocks.navigate).toHaveBeenCalledWith('/app/profile');
    open();
    fireEvent.click(screen.getByText('Account Settings'));
    expect(mocks.navigate).toHaveBeenCalledWith('/app/settings');
    open();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Dark mode/i }));
    expect(mocks.toggleTheme).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Log out'));
    expect(mocks.logout).toHaveBeenCalledTimes(1);
    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('collapsible sidebar — keyboard & accessibility', () => {
  it('uses real, focusable buttons/links in the tab order', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    const btn = toggleBtn();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).not.toHaveAttribute('tabindex', '-1');
    btn.focus();
    expect(document.activeElement).toBe(btn);
    for (const a of within(mainNav()).getAllByRole('link')) expect(a).not.toHaveAttribute('tabindex', '-1');
  });

  it('keeps focus on the toggle after activating it (state change does not drop focus)', () => {
    renderLayout();
    const btn = toggleBtn();
    btn.focus();
    fireEvent.click(btn);
    expect(document.activeElement).toBe(toggleBtn());
  });

  it('exposes the collapse state via aria-expanded and a state-specific label', () => {
    renderLayout();
    fireEvent.click(toggleBtn());
    expect(screen.getByRole('button', { name: 'Expand sidebar', expanded: false })).toBeInTheDocument();
    fireEvent.click(toggleBtn());
    expect(screen.getByRole('button', { name: 'Collapse sidebar', expanded: true })).toBeInTheDocument();
  });

  it('keeps a labelled home link to the dashboard when the wordmark is hidden', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    expect(within(desktopAside()).getByRole('link', { name: 'FlowJob home' })).toHaveAttribute('href', '/app');
  });
});

describe('mobile drawer is unaffected by the desktop preference', () => {
  it('opens a full, labelled sidebar with no collapse control, even if desktop is collapsed', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1); // drawer closed
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const navs = screen.getAllByRole('navigation', { name: 'Main' });
    expect(navs).toHaveLength(2);
    const drawer = navs[1];
    for (const [label] of DESTINATIONS) {
      const text = within(drawer).getByText(label);
      expect(text.className).not.toContain('sr-only'); // visible labels, not icon-only
    }
    // Only the desktop sidebar has the collapse toggle.
    expect(screen.getAllByRole('button', { name: /(Collapse|Expand) sidebar/i })).toHaveLength(1);
    expect(desktopAside()).toHaveAttribute('data-collapsed', 'true'); // desktop state untouched
  });

  it('closes after choosing a destination, and does not change the desktop preference', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawer = screen.getAllByRole('navigation', { name: 'Main' })[1];
    fireEvent.click(within(drawer).getByRole('link', { name: 'CV Builder' }));
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1);
    expect(screen.getByText('builder page')).toBeInTheDocument();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('true');
  });

  it('shows the full account row in the drawer even when desktop is collapsed', () => {
    localStorage.setItem(SIDEBAR_KEY, 'true');
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawerAside = screen.getAllByRole('navigation', { name: 'Main' })[1].closest('aside') as HTMLElement;
    expect(within(drawerAside).getByText('Jordan Verylongname Example')).toBeInTheDocument();
  });
});
