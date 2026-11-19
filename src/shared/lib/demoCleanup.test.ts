import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_STORAGE_KEYS, removeDemoArtifacts } from './demoCleanup';

function registration(scriptURL: string) {
  return { active: { scriptURL }, waiting: null, installing: null, unregister: vi.fn(async () => true) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('removing leftovers of the old in-browser demo', () => {
  it('removes only the demo storage keys and keeps every real setting and tab draft', async () => {
    for (const key of DEMO_STORAGE_KEYS) localStorage.setItem(key, 'demo leftover');
    const real = {
      'flowjob.theme': 'dark',
      'flowjob.sidebarCollapsed': 'true',
      'flowjob.appsView': 'board',
      'flowjob.mockdbish': 'not a demo key',
      unrelated: 'kept',
    };
    for (const [key, value] of Object.entries(real)) localStorage.setItem(key, value);
    sessionStorage.setItem('flowjob.pendingJob', 'Pasted job');
    sessionStorage.setItem('flowjob.tailorReview.d1', '{}');

    await removeDemoArtifacts();

    for (const key of DEMO_STORAGE_KEYS) expect(localStorage.getItem(key)).toBeNull();
    for (const [key, value] of Object.entries(real)) expect(localStorage.getItem(key)).toBe(value);
    expect(sessionStorage.getItem('flowjob.pendingJob')).toBe('Pasted job');
    expect(sessionStorage.getItem('flowjob.tailorReview.d1')).toBe('{}');
  });

  it('unregisters only the demo mock service worker on this origin', async () => {
    const demo = registration(`${window.location.origin}/mockServiceWorker.js`);
    const other = registration(`${window.location.origin}/sw.js`);
    const elsewhere = registration('https://other.example/mockServiceWorker.js');
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistrations: vi.fn(async () => [demo, other, elsewhere]) },
    });

    await removeDemoArtifacts();

    expect(demo.unregister).toHaveBeenCalledTimes(1);
    expect(other.unregister).not.toHaveBeenCalled();
    expect(elsewhere.unregister).not.toHaveBeenCalled();
  });

  it('never throws when storage or service workers are unavailable', async () => {
    vi.stubGlobal('localStorage', { removeItem: () => { throw new Error('blocked'); } });
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { getRegistrations: () => Promise.reject(new Error('no')) } });
    await expect(removeDemoArtifacts()).resolves.toBeUndefined();
  });
});
