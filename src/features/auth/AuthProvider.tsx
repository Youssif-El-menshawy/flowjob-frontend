import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setSessionExpiredHandler, tokenStore } from '@/shared/api/client';
import type { AuthResponse, User } from '@/shared/api/types';

interface AuthState {
  user: User | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthState | null>(null);

let initialSession: Promise<AuthResponse | null> | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');

  const accept = useCallback((r: AuthResponse) => {
    tokenStore.set(r.accessToken);
    setUser(r.user);
    setStatus('authenticated');
    return r.user;
  }, []);

  const clear = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setStatus('anonymous');
    qc.clear();
  }, [qc]);

  // Restore a session using the HttpOnly refresh cookie on first load.
  useEffect(() => {
    let alive = true;
    if (!initialSession) initialSession = refreshSession().catch(() => null);
    initialSession
      .then((r) => {
        if (!alive) return;
        if (r) accept(r);
        else setStatus('anonymous');
      })
      .catch(() => alive && setStatus('anonymous'));
    return () => {
      alive = false;
    };
  }, [accept]);

  useEffect(() => setSessionExpiredHandler(clear), [clear]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      status,
      setUser,
      login: async (email, password) =>
        accept(await api<AuthResponse>('/auth/login', { method: 'POST', json: { email, password } })),
      register: async (name, email, password) =>
        accept(await api<AuthResponse>('/auth/register', { method: 'POST', json: { name, email, password } })),
      logout: async () => {
        try {
          await api('/auth/logout', { method: 'POST' });
        } finally {
          initialSession = null;
          clear();
        }
      },
    }),
    [user, status, accept, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
