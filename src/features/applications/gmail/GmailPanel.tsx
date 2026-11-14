import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/client';
import { qk, useDisconnectGmail, useGmail, useStartGmailOAuth, useSyncGmail } from '@/shared/api/queries';
import type { GmailStatus } from '@/shared/api/types';
import { fmtRelative } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Display';
import { Icon } from '@/shared/ui/Icons';
import { ConfirmDialog, useToast } from '@/shared/ui/Overlay';
import { Spinner } from '@/shared/ui/Spinner';
import { GmailConnectDialog } from './GmailConnectDialog';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Navigation away to Google. Kept in one place so tests can observe it. */
export const goTo = {
  assign: (url: string) => window.location.assign(url),
};

function summaryText(s: NonNullable<GmailStatus['sync']>): string | null {
  const r = s.lastRun;
  if (!r) return null;
  const parts = [
    r.imported && `${plural(r.imported, 'application')} added`,
    r.activities && `${plural(r.activities, 'update')} recorded`,
    r.reviews && `${plural(r.reviews, 'suggestion')} to review`,
  ].filter(Boolean);
  return parts.length ? `Last sync: ${parts.join(', ')}.` : 'Last sync found nothing new.';
}

export function GmailPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const gmail = useGmail();
  const start = useStartGmailOAuth();
  const sync = useSyncGmail();
  const disconnect = useDisconnectGmail();
  const [dialog, setDialog] = useState<'connect' | 'reconnect' | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const running = !!gmail.data?.sync?.running;
  const wasRunning = useRef(running);

  // When a background sync finishes, refresh the board and the review list once.
  useEffect(() => {
    if (wasRunning.current && !running) {
      void qc.invalidateQueries({ queryKey: qk.apps });
      void qc.invalidateQueries({ queryKey: qk.gmailReviews });
    }
    wasRunning.current = running;
  }, [running, qc]);

  if (gmail.isLoading) {
    return (
      <Card className="mb-6 flex items-center gap-3" aria-busy="true">
        <Spinner className="size-4" />
        <span className="text-sm text-soft">Loading Gmail…</span>
      </Card>
    );
  }
  if (gmail.isError || !gmail.data) {
    return (
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p role="alert" className="text-sm text-danger">
          Could not load Gmail status.
        </p>
        <Button size="sm" variant="secondary" loading={gmail.isFetching} onClick={() => void gmail.refetch()}>
          Retry
        </Button>
      </Card>
    );
  }

  const g = gmail.data;
  const state = g.connection.state;
  if (state === 'not_connected' && !g.available) return null; // not configured on this server

  const beginOAuth = (mode: 'connect' | 'reconnect') =>
    start.mutate(mode, {
      onSuccess: ({ authorizationUrl }) => goTo.assign(authorizationUrl),
      onError: (e) =>
        toast({ text: e instanceof ApiError ? e.message : 'Could not start Google sign-in. Try again.', tone: 'error' }),
    });

  const runSync = (retryFailed: boolean) =>
    sync.mutate(retryFailed, {
      onSuccess: () => toast({ text: retryFailed ? 'Retrying failed emails…' : 'Sync started.' }),
      onError: (e) => {
        toast({ text: e instanceof ApiError ? e.message : 'Could not start a sync. Try again.', tone: 'error' });
        void gmail.refetch();
      },
    });

  const s = g.sync;
  return (
    <Card className="mb-6 animate-in" aria-labelledby="gmail-panel-title">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tint text-primary">
          <Icon.mail />
        </span>
        <div className="min-w-[220px] flex-1">
          <h2 id="gmail-panel-title" className="text-[17px] font-semibold">
            Gmail
          </h2>
          {state === 'not_connected' && (
            <p className="mt-1 text-sm leading-relaxed text-soft">
              Connect Gmail to add applications from confirmation emails and keep track of interviews, offers and
              replies. You approve every status change.
            </p>
          )}
          {state !== 'not_connected' && (
            <p className="mt-1 text-sm text-soft">
              {state === 'reauth_required' ? 'Access expired' : 'Connected'} · {g.connection.email}
              {s?.lastSuccessAt && ` · synced ${fmtRelative(s.lastSuccessAt)}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {state === 'not_connected' && <Button onClick={() => setDialog('connect')}>Connect Gmail</Button>}
          {state === 'reauth_required' && <Button onClick={() => setDialog('reconnect')}>Reconnect Gmail</Button>}
          {state === 'active' && (
            <Button variant="secondary" loading={sync.isPending} disabled={running} onClick={() => runSync(false)}>
              {running ? 'Syncing…' : 'Sync now'}
            </Button>
          )}
          {state !== 'not_connected' && (
            <Button variant="ghost" onClick={() => setConfirmDisconnect(true)}>
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {state === 'reauth_required' && (
        <p role="alert" className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-sm">
          Google access expired. Reconnect with the same account to continue. Your progress and suggestions are
          kept.
        </p>
      )}

      {state === 'active' && s && (
        <div className="mt-4 flex flex-col gap-2 text-sm" aria-live="polite">
          {running ? (
            <p className="flex items-center gap-2">
              <Spinner className="size-4" />
              {s.phase === 'backfill' ? 'Checking the last 30 days of email…' : 'Checking for new email…'}
              {s.remaining > 0 && ` ${plural(s.remaining, 'email')} to go.`}
            </p>
          ) : s.caughtUp ? (
            <p className="text-soft">Up to date.</p>
          ) : s.remaining > 0 ? (
            <p className="text-soft">
              {plural(s.remaining, 'email')} still to check. They continue on the next sync.
            </p>
          ) : null}
          {!running && summaryText(s) && <p className="text-soft">{summaryText(s)}</p>}
          {s.error && (
            <p role="alert" className="text-danger">
              {s.error.message}
            </p>
          )}
          {s.failed > 0 && !running && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-danger">{plural(s.failed, 'email')} could not be analysed.</span>
              <Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => runSync(true)}>
                Retry sync
              </Button>
            </div>
          )}
        </div>
      )}

      <GmailConnectDialog
        open={dialog !== null}
        reconnect={dialog === 'reconnect'}
        loading={start.isPending}
        onClose={() => setDialog(null)}
        onContinue={() => beginOAuth(dialog ?? 'connect')}
      />
      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Gmail?"
        text="FlowJob will stop reading Gmail and erase its Gmail data: access, excerpts, suggestions and sync progress. Applications you already have, and statuses you approved, stay."
        confirmLabel="Disconnect"
        danger
        loading={disconnect.isPending}
        onConfirm={() =>
          disconnect.mutate(undefined, {
            onSuccess: () => {
              setConfirmDisconnect(false);
              toast({ text: 'Gmail disconnected.' });
            },
            onError: () => toast({ text: 'Could not disconnect Gmail. Try again.', tone: 'error' }),
          })
        }
      />
    </Card>
  );
}
