// FlowJob used to ship an in-browser demo (a mock API in a service worker, with its data in localStorage).
// Browsers that ran it can still hold those leftovers. Remove exactly those, nothing else: real sessions live in the
// backend's httpOnly cookie, and CVs and applications live in the backend database.

/** Every localStorage key the removed demo ever wrote (src/mocks/db.ts, all versions). */
export const DEMO_STORAGE_KEYS = ['flowjob.mockdb.v1', 'flowjob.mockdb.v2', 'flowjob.mock.refreshCookie'] as const;
const DEMO_WORKER_PATH = '/mockServiceWorker.js';

function isDemoWorker(registration: ServiceWorkerRegistration): boolean {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) return false;
  try {
    const url = new URL(worker.scriptURL);
    return url.origin === window.location.origin && url.pathname === DEMO_WORKER_PATH;
  } catch {
    return false;
  }
}

/** Best effort and silent: a failure here must never block the app from starting. */
export async function removeDemoArtifacts(): Promise<void> {
  try {
    for (const key of DEMO_STORAGE_KEYS) localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations ?? []).filter(isDemoWorker).map((registration) => registration.unregister()));
  } catch {
    /* service workers unavailable */
  }
}
