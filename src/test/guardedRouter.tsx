import { createMemoryRouter, Outlet, type RouteObject } from 'react-router-dom';
import { LeaveGuardProvider } from '@/shared/ui/LeaveGuard';

type Entries = NonNullable<NonNullable<Parameters<typeof createMemoryRouter>[1]>['initialEntries']>;

/** A data router with the app's interruption guard around every route, as in `appRoutes`. */
export function guardedRouter(routes: RouteObject[], initialEntries: Entries = ['/'], initialIndex?: number) {
  return createMemoryRouter(
    [{ element: <LeaveGuardProvider><Outlet /></LeaveGuardProvider>, children: routes }],
    { initialEntries, initialIndex },
  );
}

/** Fires the browser's refresh/close event. True when the page let it through (no native warning). */
export function unload(): boolean {
  return window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
}
