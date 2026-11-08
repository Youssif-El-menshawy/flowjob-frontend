import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApplications } from '@/shared/api/queries';
import { cn } from '@/shared/lib/utils';
import { Logo } from '@/shared/ui/Display';
import { Icon } from '@/shared/ui/Icons';
import { PageLoader } from '@/shared/ui/Spinner';
import { AccountMenu } from './AccountMenu';

// Only the core product features — Profile and Settings live in the account menu below.
const NAV = [
  { to: '/app', label: 'Dashboard', icon: Icon.dashboard, end: true },
  { to: '/app/cv-builder', label: 'CV Builder', icon: Icon.builder },
  { to: '/app/cvs', label: 'My CVs', icon: Icon.cvs },
  { to: '/app/match', label: 'Job Match', icon: Icon.match },
  { to: '/app/applications', label: 'Applications', icon: Icon.apps, badge: true },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { data: apps } = useApplications();
  const pending = apps?.filter((a) => a.suggestion).length ?? 0;

  return (
    <div className="flex h-full flex-col gap-1 px-4 pt-7 pb-5">
      <div className="px-2.5 pb-7">
        <Logo to="/app" />
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Ico, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-full px-3 text-[15px] transition-colors',
                isActive
                  ? 'bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(var(--shadow)/0.08)]'
                  : 'font-medium text-soft hover:bg-surface/60 hover:text-ink',
              )
            }
          >
            <Ico />
            <span className="flex-1">{label}</span>
            {badge && pending > 0 && (
              <span
                className="grid min-w-[22px] place-items-center rounded-full bg-accent px-1.5 text-xs font-bold text-[#1c2b22]"
                aria-label={`${pending} to review`}
              >
                {pending}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="flex-1" />
      <AccountMenu onNavigate={onNavigate} />
    </div>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 bg-side lg:block">
        <Sidebar />
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-side/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo to="/app" />
        <button
          onClick={() => setOpen(true)}
          className="grid size-11 place-items-center rounded-full hover:bg-surface"
          aria-label="Open menu"
        >
          <Icon.menu />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 animate-in"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-[272px] bg-side shadow-xl animate-in">
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main id="main" className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-[1120px]">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
