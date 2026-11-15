import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/client';
import { qk, useDisconnectGmail, useGmail, useSyncGmail } from '@/shared/api/queries';
import { cn, fmtRelative } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icons';
import { ConfirmDialog, useToast } from '@/shared/ui/Overlay';
import { Spinner } from '@/shared/ui/Spinner';
import { GmailConnectDialog } from './GmailConnectDialog';
import { useGmailOAuth } from './useGmailOAuth';

export { goTo } from './useGmailOAuth';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Tone = 'ok' | 'warn' | 'muted';

const CHIP: Record<Tone, string> = {
  ok: 'bg-success-bg text-success-ink',
  warn: 'bg-danger-soft text-danger',
  muted: 'bg-tint text-ink',
};

/**
 * The compact Gmail bar: icon, title and status on the left, actions on the right (stacked on phones).
 * `notice` is an optional second row for things that must stay visible (errors, expired access, failures).
 */
function Bar({
  status,
  badge,
  detail,
  actions,
  notice,
  live,
  busy,
}: {
  status?: { label: string; tone: Tone };
  /** Shown next to the status chip (the pending-review jump). */
  badge?: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  notice?: ReactNode;
  live?: boolean;
  busy?: boolean;
}) {
  return (
    <section
      aria-labelledby="gmail-panel-title"
      aria-busy={busy || undefined}
      className="mb-6 rounded-2xl border border-line bg-surface px-4 py-3 animate-in sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint text-primary">
            <Icon.mail />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 id="gmail-panel-title" className="text-[15px] leading-snug font-semibold">
                Gmail
              </h2>
              {status && (
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', CHIP[status.tone])}>
                  {status.label}
                </span>
              )}
              {badge}
            </div>
            {detail && (
              <div className="mt-0.5 text-[13px] leading-snug break-words text-soft" aria-live={live ? 'polite' : undefined}>
                {detail}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
      </div>
      {notice && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-2.5 text-[13px] leading-snug">
          {notice}
        </div>
      )}
    </section>
  );
}

export function GmailPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const gmail = useGmail();
  const oauth = useGmailOAuth();
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
      <Bar
        busy
        detail={
          <span className="inline-flex items-center gap-2">
            <Spinner className="size-3.5" />
            Loading Gmail…
          </span>
        }
      />
    );
  }
  if (gmail.isError || !gmail.data) {
    return (
      <Bar
        detail={
          <span role="alert" className="text-danger">
            Could not load Gmail status.
          </span>
        }
        actions={
          <Button size="sm" variant="secondary" loading={gmail.isFetching} onClick={() => void gmail.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const g = gmail.data;
  const state = g.connection.state;
  if (state === 'not_connected' && !g.available) return null; // not configured on this server

  const runSync = (retryFailed: boolean) =>
    sync.mutate(retryFailed, {
      onSuccess: () => toast({ text: retryFailed ? 'Retrying failed emails…' : 'Sync started.' }),
      onError: (e) => {
        toast({ text: e instanceof ApiError ? e.message : 'Could not start a sync. Try again.', tone: 'error' });
        void gmail.refetch();
      },
    });

  const finishDisconnect = (onDone?: () => void) =>
    disconnect.mutate(undefined, {
      onSuccess: () => {
        onDone?.();
        toast({ text: 'Gmail disconnected.' });
      },
      onError: (e) => {
        onDone?.();
        toast({ text: e instanceof ApiError ? e.message : 'Could not disconnect Gmail. Try again.', tone: 'error' });
      },
    });

  if (state === 'disconnecting') {
    return (
      <Bar
        status={{ label: 'Disconnecting', tone: 'warn' }}
        detail={
          <span role="status">
            Disconnecting… FlowJob is erasing its Gmail data. If this does not finish, try again; it is safe to
            repeat.
          </span>
        }
        actions={
          <Button size="sm" variant="secondary" loading={disconnect.isPending} onClick={() => finishDisconnect()}>
            Finish disconnecting
          </Button>
        }
      />
    );
  }

  const s = g.sync;
  const pending = g.pendingReviewCount ?? 0;
  const connected = state === 'active' || state === 'reauth_required';

  const status: { label: string; tone: Tone } =
    state === 'not_connected'
      ? { label: 'Not connected', tone: 'muted' }
      : state === 'reauth_required'
        ? { label: 'Access expired', tone: 'warn' }
        : running
          ? { label: 'Syncing', tone: 'muted' }
          : { label: 'Connected', tone: 'ok' };

  let detail: ReactNode;
  if (state === 'not_connected') {
    detail = 'Add applications from confirmation emails and track interviews, offers and replies. You approve every status change.';
  } else if (state === 'active' && running && s) {
    detail = (
      <span className="inline-flex flex-wrap items-center gap-x-1.5">
        <Spinner className="size-3.5" />
        {s.phase === 'backfill' ? 'Checking the last 30 days of email…' : 'Checking for new email…'}
        {s.remaining > 0 && ` ${plural(s.remaining, 'email')} to go.`}
      </span>
    );
  } else {
    detail = [
      g.connection.email,
      s?.lastSuccessAt && `synced ${fmtRelative(s.lastSuccessAt)}`,
      state === 'active' && s && s.remaining > 0 && `${plural(s.remaining, 'email')} left for the next sync`,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  // Shown in a second row so they are never hidden: expired access, sync errors, emails that failed analysis.
  const showSyncIssues = state === 'active' && s && !running;
  const notice =
    state === 'reauth_required' ? (
      <p role="alert" className="text-danger">
        Google access expired. Reconnect with the same account to continue. Your progress and suggestions are kept.
      </p>
    ) : showSyncIssues && (s.error || s.failed > 0) ? (
      <>
        {s.error && (
          <p role="alert" className="text-danger">
            {s.error.message}
            {s.retryAt && ` Next try ${fmtRelative(s.retryAt)}.`}
          </p>
        )}
        {s.failed > 0 && (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-danger">{plural(s.failed, 'email')} could not be analysed.</span>
            <Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => runSync(true)}>
              Retry sync
            </Button>
          </span>
        )}
      </>
    ) : null;

  return (
    <>
      <Bar
        status={status}
        badge={
          connected &&
          pending > 0 && (
            <button
              type="button"
              className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink hover:underline"
              onClick={() =>
                document.getElementById('needs-review-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              {pending} to review
            </button>
          )
        }
        live={state === 'active'}
        detail={detail}
        notice={notice}
        actions={
          <>
            {state === 'not_connected' && (
              <Button size="sm" onClick={() => setDialog('connect')}>
                Connect Gmail
              </Button>
            )}
            {state === 'reauth_required' && (
              <Button size="sm" onClick={() => setDialog('reconnect')}>
                Reconnect Gmail
              </Button>
            )}
            {state === 'active' && (
              <Button size="sm" variant="secondary" loading={sync.isPending} disabled={running} onClick={() => runSync(false)}>
                {running ? 'Syncing…' : 'Sync now'}
              </Button>
            )}
            {connected && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(true)}>
                Disconnect
              </Button>
            )}
          </>
        }
      />

      <GmailConnectDialog
        open={dialog !== null}
        reconnect={dialog === 'reconnect'}
        loading={oauth.isPending}
        onClose={() => setDialog(null)}
        onContinue={() => oauth.begin(dialog ?? 'connect')}
      />
      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Gmail?"
        text="FlowJob will stop reading Gmail and erase its Gmail data: access, excerpts, suggestions, dismissed suggestions and sync progress. Applications you already have, and statuses you approved, stay. If you connect Gmail again later, FlowJob checks the last 30 days again, so suggestions you dismissed may reappear."
        confirmLabel="Disconnect"
        danger
        loading={disconnect.isPending}
        onConfirm={() => finishDisconnect(() => setConfirmDisconnect(false))}
      />
    </>
  );
}
