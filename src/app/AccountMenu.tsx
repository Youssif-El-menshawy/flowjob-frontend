import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn, initials } from '@/shared/lib/utils';
import { useTheme } from '@/shared/lib/theme';
import { Icon } from '@/shared/ui/Icons';
import { useToast } from '@/shared/ui/Overlay';

/**
 * Bottom-left account menu: the whole user row is a button that opens a popover ABOVE it
 * (so it never clips at the bottom of the viewport) with My Profile, Account Settings,
 * Appearance (dark mode) and Log out. Closes on outside click / Escape, supports arrow-key
 * navigation, and uses menu ARIA roles. No external dependency.
 */
export function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Focus the first menu item once the popover opens.
    menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    }
  };

  const go = (to: string) => {
    setOpen(false);
    onNavigate?.();
    nav(to);
  };
  const doLogout = async () => {
    setOpen(false);
    try {
      await logout();
      nav('/', { replace: true });
    } catch {
      toast({ text: 'Could not log out. Please try again.', tone: 'error' });
    }
  };

  const itemClass = 'flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors';
  const current = (path: string) => loc.pathname === path || loc.pathname.startsWith(`${path}/`);

  return (
    <div ref={rootRef} className="relative mt-2 border-t border-line pt-3">
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-2xl border border-line bg-surface p-1.5 shadow-xl"
        >
          <button
            role="menuitem"
            onClick={() => go('/app/profile')}
            aria-current={current('/app/profile') ? 'page' : undefined}
            className={cn(itemClass, current('/app/profile') ? 'bg-tint font-medium text-ink' : 'text-ink hover:bg-tint')}
          >
            <Icon.profile />
            My Profile
          </button>
          <button
            role="menuitem"
            onClick={() => go('/app/settings')}
            aria-current={current('/app/settings') ? 'page' : undefined}
            className={cn(itemClass, current('/app/settings') ? 'bg-tint font-medium text-ink' : 'text-ink hover:bg-tint')}
          >
            <Icon.settings />
            Account Settings
          </button>
          <button
            role="menuitemcheckbox"
            aria-checked={theme === 'dark'}
            onClick={toggle}
            className={cn(itemClass, 'justify-between text-ink hover:bg-tint')}
          >
            <span className="flex items-center gap-3">
              {theme === 'dark' ? <Icon.moon /> : <Icon.sun />}
              Dark mode
            </span>
            <span
              aria-hidden
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                theme === 'dark' ? 'bg-primary' : 'bg-line',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-surface transition-transform',
                  theme === 'dark' ? 'translate-x-4' : 'translate-x-0.5',
                )}
              />
            </span>
          </button>
          <div className="my-1 border-t border-line" />
          <button
            role="menuitem"
            onClick={doLogout}
            className={cn(itemClass, 'text-danger hover:bg-danger/10')}
          >
            <Icon.logout />
            Log out
          </button>
        </div>
      )}

      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors hover:bg-surface/60"
      >
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#b9d0b8] text-sm font-semibold text-[#1c2b22]">
          {initials(user?.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user?.name}</p>
          <p className="truncate text-xs text-soft">{user?.email}</p>
        </div>
        <svg
          viewBox="0 0 24 24"
          className={cn('size-4 shrink-0 text-soft transition-transform', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m18 15-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
