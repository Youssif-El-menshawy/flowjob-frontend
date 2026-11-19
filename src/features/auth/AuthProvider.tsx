import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { authSession } from '@/shared/api/client';
import type { User } from '@/shared/api/types';

interface AuthState {
  user: User | null;
  /** 'unavailable': the server could not be reached when checking the session; nobody was signed out. */
  status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable';
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
  retry: () => void;
}

const Ctx = createContext<AuthState | null>(null);
const cacheOwners = new WeakMap<QueryClient, string | undefined>();

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const session = useSyncExternalStore(authSession.subscribe, authSession.getSnapshot);

  useLayoutEffect(() => {
    const syncCacheOwner = () => {
      const currentUser = authSession.getSnapshot().user?.id;
      if (cacheOwners.has(qc) && cacheOwners.get(qc) !== currentUser) qc.clear();
      cacheOwners.set(qc, currentUser);
    };
    syncCacheOwner();
    const unsubscribe = authSession.subscribe(syncCacheOwner);
    authSession.initialize();
    return unsubscribe;
  }, [qc]);

  const value = useMemo<AuthState>(() => ({
    ...session,
    setUser: authSession.setUser,
    login: authSession.login,
    register: authSession.register,
    logout: authSession.logout,
    retry: authSession.retry,
  }), [session]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
