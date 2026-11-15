import { ApiError } from '@/shared/api/client';
import { useStartGmailOAuth } from '@/shared/api/queries';
import { useToast } from '@/shared/ui/Overlay';

/** Navigation away to Google. Kept in one place so tests can observe it. */
export const goTo = {
  assign: (url: string) => window.location.assign(url),
};

/**
 * Starts Google OAuth (connect or reconnect) and sends the browser to Google. Shared by the Gmail panel on
 * Applications and the Dashboard so both use exactly the same flow, always after `GmailConnectDialog`.
 */
export function useGmailOAuth() {
  const toast = useToast();
  const start = useStartGmailOAuth();
  const begin = (mode: 'connect' | 'reconnect') =>
    start.mutate(mode, {
      onSuccess: ({ authorizationUrl }) => goTo.assign(authorizationUrl),
      onError: (e) =>
        toast({ text: e instanceof ApiError ? e.message : 'Could not start Google sign-in. Try again.', tone: 'error' }),
    });
  return { begin, isPending: start.isPending };
}
