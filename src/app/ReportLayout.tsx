import { Suspense, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/shared/ui/Display';
import { Icon } from '@/shared/ui/Icons';
import { PageLoader } from '@/shared/ui/Spinner';

/**
 * Lightweight layout for focused, full-width reports (e.g. a saved Job Match analysis).
 * Deliberately has NO application sidebar: it is a sibling of AppLayout in the route tree,
 * not a CSS-hidden variant of it. Authentication is enforced by the route that mounts it.
 */
export function ReportLayout() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  return (
    <div className="min-h-screen">
      <a
        href="#report"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to report
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-5 py-2.5 sm:px-8">
          <Link
            to="/app/match"
            className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-primary hover:bg-tint"
          >
            <Icon.arrowLeft />
            Back to Job Match
          </Link>
          <div className="opacity-70 transition-opacity hover:opacity-100">
            <Logo to="/app" />
          </div>
        </div>
      </header>
      <main id="report" className="mx-auto w-full max-w-[1240px] px-5 py-8 sm:px-8 lg:py-10">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
