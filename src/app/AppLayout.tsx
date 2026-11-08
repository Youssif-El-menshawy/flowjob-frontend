import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApplications } from '@/shared/api/queries';
import { useSidebarCollapsed } from '@/shared/lib/sidebar';
import { cn } from '@/shared/lib/utils';
import { Logo, LogoMark } from '@/shared/ui/Display';
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

const SIDEBAR_ID = 'app-sidebar';

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={!collapsed}
      aria-controls={SIDEBAR_ID}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-full text-soft transition-colors hover:bg-surface/60 hover:text-ink"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {collapsed ? (
          <>
            <path d="m6 17 5-5-5-5" />
            <path d="m13 17 5-5-5-5" />
          </>
        ) : (
          <>
            <path d="m18 17-5-5 5-5" />
            <path d="m11 17-5-5 5-5" />
          </>
        )}
      </svg>
    </button>
  );
}

/**
 * The navigation panel. `collapsed` (desktop only) shows icons with accessible labels and
 * tooltips; the mobile drawer never passes `onToggleCollapse`, so it is always the full
 * sidebar and is unaffected by the desktop preference.
 */
function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { data: apps } = useApplications();
  const pending = apps?.filter((a) => a.suggestion).length ?? 0;

  return (
    <div className={cn('flex h-full flex-col gap-1 pb-5', collapsed ? 'px-3 pt-6' : 'px-4 pt-7')}>
      {collapsed ? (
        <div className="flex flex-col items-center gap-3 pb-5">
          <Link to="/app" aria-label="FlowJob home" className="grid size-9 place-items-center rounded-full">
            <LogoMark />
          </Link>
          {onToggleCollapse && <CollapseToggle collapsed onToggle={onToggleCollapse} />}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pr-1 pb-7 pl-2.5">
          <Logo to="/app" />
          {onToggleCollapse && <CollapseToggle collapsed={false} onToggle={onToggleCollapse} />}
        </div>
      )}
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Ico, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'group relative flex min-h-11 items-center rounded-full text-[15px] transition-colors',
                collapsed ? 'mx-auto size-11 justify-center' : 'gap-3 px-3',
                isActive
                  ? 'bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(var(--shadow)/0.08)]'
                  : 'font-medium text-soft hover:bg-surface/60 hover:text-ink',
              )
            }
          >
            <Ico />
            {collapsed ? <span className="sr-only">{label}</span> : <span className="flex-1">{label}</span>}
            {badge && pending > 0 && (
              <span
                className={cn(
                  'grid place-items-center rounded-full bg-accent text-xs font-bold text-[#1c2b22]',
                  collapsed ? 'absolute -top-0.5 -right-0.5 min-w-[18px] px-1 text-[10px]' : 'min-w-[22px] px-1.5',
                )}
                aria-label={`${pending} to review`}
              >
                {pending}
              </span>
            )}
            {collapsed && (
              // Visual tooltip for hover and keyboard focus; the sr-only label is the accessible name.
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-full z-30 ml-3 -translate-y-1/2 rounded-lg bg-ink px-2.5 py-1 text-xs font-medium whitespace-nowrap text-bg opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="flex-1" />
      <AccountMenu onNavigate={onNavigate} collapsed={collapsed} />
    </div>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
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
      <aside
        id={SIDEBAR_ID}
        data-collapsed={collapsed}
        className={cn(
          'sticky top-0 z-20 hidden h-screen shrink-0 bg-side lg:block',
          collapsed ? 'w-[72px]' : 'w-[248px]',
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={toggle} />
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
        {/* flex-1 hands the freed width to the page; the content cap grows by the same amount. */}
        <div className={cn('mx-auto max-w-[1120px]', collapsed && 'lg:max-w-[1296px]')}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
