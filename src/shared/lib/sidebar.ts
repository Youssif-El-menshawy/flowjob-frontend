import { useCallback, useEffect, useState } from 'react';

/** The one localStorage key for the desktop sidebar preference. */
export const SIDEBAR_KEY = 'flowjob.sidebarCollapsed';

/** Stored as the string "true" / "false". No stored value (or blocked storage) = expanded. */
export function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Desktop sidebar collapsed state, persisted in localStorage. The value is read
 * synchronously on first render (no expand→collapse flash on reload) and is only written
 * when the user actually toggles it. Other tabs stay in sync through the `storage` event.
 */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);

  const toggle = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, String(next));
    } catch {
      /* storage unavailable: the toggle still works for this session */
    }
  }, [collapsed]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIDEBAR_KEY) setCollapsed(e.newValue === 'true');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { collapsed, toggle };
}
