import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { SERVER_UNAVAILABLE_MESSAGE, serverConnection } from '@/shared/api/client';
import { Logo } from '@/shared/ui/Display';
import { Button } from '@/shared/ui/Button';

/**
 * Shown instead of a protected page when the first session check could not reach the backend. The user is NOT
 * signed out: once the server answers, "Try again" restores their session (or sends them to log in if it ended).
 */
export function ServerUnavailablePage() {
  const { retry } = useAuth();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <div role="alert" className="max-w-md">
        <h1 className="text-2xl font-semibold">FlowJob is unavailable right now.</h1>
        <p className="mt-3 leading-relaxed text-soft">{SERVER_UNAVAILABLE_MESSAGE}</p>
        <p className="mt-2 text-sm text-soft">Your account and data are safe. Nothing was changed.</p>
      </div>
      <Button onClick={retry}>Try again</Button>
    </main>
  );
}

/** A banner on every page while the last request could not reach the backend. It clears on the next answer. */
export function ServerStatusBanner() {
  const reachable = useSyncExternalStore(serverConnection.subscribe, serverConnection.getSnapshot);
  const { status, retry } = useAuth();
  const qc = useQueryClient();
  // The full unavailable page already says it; one message is enough.
  if (reachable || status === 'unavailable') return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-surface px-4 py-3 text-sm shadow-lg"
    >
      <span className="text-danger">{SERVER_UNAVAILABLE_MESSAGE}</span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          retry();
          void qc.refetchQueries({ type: 'active' });
        }}
      >
        Try again
      </Button>
    </div>
  );
}
