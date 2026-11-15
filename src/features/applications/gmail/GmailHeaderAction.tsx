import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/client';
import { qk, useGmail, useSyncGmail } from '@/shared/api/queries';
import type { GmailStatus } from '@/shared/api/types';
import { GmailConnectDialog } from './GmailConnectDialog';
import { useGmailOAuth } from './useGmailOAuth';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Overlay';
import { Skeleton } from '@/shared/ui/Spinner';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type GmailAction = 'connect' | 'reconnect' | 'sync' | 'syncing' | 'review' | 'manage' | 'none';

/** Gmail connection management (disconnect, retrying failed emails) lives in Settings. */
export const GMAIL_SETTINGS = '/app/settings';

/** The sync is stuck or failed in a way that needs the detailed Gmail card in Settings. */
const syncProblem = (s: GmailStatus['sync']) =>
  !s?.running && !!(s?.error?.message || s?.needsAttention || (s?.failed ?? 0) > 0);

/**
 * Which single Gmail action a page header offers. Detailed management stays in Settings. With `problemAsSync`
 * a sync problem still offers Sync Gmail (the header status line explains the problem and links to Settings).
 * With `review: false` pending reviews do not replace Sync Gmail (the page has its own review entry point).
 */
export function gmailAction(
  g: GmailStatus | undefined,
  loadFailed: boolean,
  { problemAsSync = false, review = true }: { problemAsSync?: boolean; review?: boolean } = {},
): GmailAction {
  if (loadFailed) return 'manage';
  if (!g) return 'none';
  const state = g.connection.state;
  if (state === 'not_connected') return g.available ? 'connect' : 'none';
  if (state === 'disconnecting') return 'manage';
  if (state === 'reauth_required') return 'reconnect';
  if (g.sync?.running) return 'syncing';
  if (review && (g.pendingReviewCount ?? 0) > 0) return 'review';
  if (syncProblem(g.sync) && !problemAsSync) return 'manage';
  return 'sync';
}

/**
 * A page header's Gmail button: Connect Gmail, Sync Gmail, Syncing…, Review emails (N), Reconnect Gmail or
 * Manage Gmail (to Settings). Connecting reuses the consent dialog and OAuth start; syncing reuses the same sync
 * request. When Gmail is not configured on the server, `fallback` is shown instead.
 *
 * - `review`: offer Review emails (N) when reviews are pending (a link to Applications). Applications passes false:
 *   its Needs review bar is the review entry point, so its header keeps Sync Gmail.
 * - `showRemaining`: put the real remaining email count in the Syncing… label when the backend reports one.
 * - `problemAsSync`: on a sync problem keep offering Sync Gmail instead of Manage Gmail.
 */
export function GmailHeaderAction({
  fallback,
  review = true,
  showRemaining = false,
  problemAsSync = false,
}: {
  fallback?: ReactNode;
  review?: boolean;
  showRemaining?: boolean;
  problemAsSync?: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const gmail = useGmail();
  const oauth = useGmailOAuth();
  const sync = useSyncGmail();
  const [dialog, setDialog] = useState<'connect' | 'reconnect' | null>(null);
  const running = !!gmail.data?.sync?.running;
  const wasRunning = useRef(running);

  // Same as the Applications panel: when a background sync finishes, refresh applications and reviews once.
  useEffect(() => {
    if (wasRunning.current && !running) {
      void qc.invalidateQueries({ queryKey: qk.apps });
      void qc.invalidateQueries({ queryKey: qk.gmailReviews });
    }
    wasRunning.current = running;
  }, [running, qc]);

  if (gmail.isLoading) return <Skeleton className="h-11 w-36 rounded-full" />;
  const action = gmailAction(gmail.data, gmail.isError || !gmail.data, { problemAsSync, review });

  const dialogEl = (
    <GmailConnectDialog
      open={dialog !== null}
      reconnect={dialog === 'reconnect'}
      loading={oauth.isPending}
      onClose={() => setDialog(null)}
      onContinue={() => oauth.begin(dialog ?? 'connect')}
    />
  );

  switch (action) {
    case 'connect':
    case 'reconnect':
      return (
        <>
          <Button variant="secondary" onClick={() => setDialog(action)}>
            {action === 'connect' ? 'Connect Gmail' : 'Reconnect Gmail'}
          </Button>
          {dialogEl}
        </>
      );
    case 'sync':
      return (
        <Button
          variant="secondary"
          loading={sync.isPending}
          onClick={() =>
            sync.mutate(false, {
              onSuccess: () => toast({ text: 'Sync started.' }),
              onError: (e) => {
                toast({ text: e instanceof ApiError ? e.message : 'Could not start a sync. Try again.', tone: 'error' });
                void gmail.refetch();
              },
            })
          }
        >
          Sync Gmail
        </Button>
      );
    case 'syncing': {
      const left = gmail.data?.sync?.remaining ?? 0;
      return (
        <Button variant="secondary" loading>
          {showRemaining && left > 0 ? `Syncing… ${left} left` : 'Syncing…'}
        </Button>
      );
    }
    case 'review':
      return (
        <ButtonLink to="/app/applications" variant="secondary">
          Review emails ({gmail.data!.pendingReviewCount})
        </ButtonLink>
      );
    case 'manage':
      return (
        <ButtonLink to={GMAIL_SETTINGS} variant="secondary">
          Manage Gmail
        </ButtonLink>
      );
    default:
      return <>{fallback}</>;
  }
}

/**
 * Small, unobtrusive Gmail line inside the header subtitle: why Gmail needs managing. Sync progress is not shown
 * here; the header button's disabled "Syncing…" state covers it. `settingsLink` adds a link to the Gmail card in
 * Settings (for pages whose header button does not already lead there).
 */
export function GmailHeaderStatus({ settingsLink = false }: { settingsLink?: boolean }) {
  const gmail = useGmail();
  const g = gmail.data;
  if (gmail.isError && !g) {
    return <span className="mt-1 block text-[13px] text-soft">Could not load Gmail status.</span>;
  }
  if (!g) return null;
  const state = g.connection.state;
  const s = g.sync;

  let text: ReactNode = null;
  if (state === 'disconnecting') text = 'Gmail is disconnecting. Finish it in Settings.';
  else if (state === 'reauth_required') text = 'Gmail access expired. Reconnect to keep tracking.';
  else if (state === 'active' && syncProblem(s))
    text = s?.error?.message || (s?.needsAttention ? 'Gmail sync needs attention.' : `${plural(s!.failed, 'email')} could not be analysed.`);

  // Rendered inside the header subtitle paragraph, so it is a block span; empty (and hidden) when all is well.
  return (
    <span className="mt-1 block text-[13px] text-soft empty:hidden" aria-live="polite">
      {text}
      {text && settingsLink && state !== 'disconnecting' && (
        <>
          {' '}
          <Link to={GMAIL_SETTINGS} className="font-medium text-primary hover:underline">
            Gmail settings
          </Link>
        </>
      )}
    </span>
  );
}
