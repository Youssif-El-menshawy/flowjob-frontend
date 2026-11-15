import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Tone = 'ok' | 'warn' | 'muted';
const CHIP: Record<Tone, string> = {
  ok: 'bg-success-bg text-success-ink',
  warn: 'bg-danger-soft text-danger',
  muted: 'bg-tint text-ink',
};

function Shell({
  status,
  children,
  actions,
  busy,
}: {
  status?: { label: string; tone: Tone };
  children?: ReactNode;
  actions?: ReactNode;
  busy?: boolean;
}) {
  return (
    <section
      aria-labelledby="gmail-settings-title"
      aria-busy={busy || undefined}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 animate-in sm:p-6"
      style={{ animationDelay: '.08s' }}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint text-primary">
          <Icon.mail />
        </span>
        <h2 id="gmail-settings-title" className="text-[17px] font-semibold">
          Gmail
        </h2>
        {status && (
          <span className={cn('ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold', CHIP[status.tone])}>
            {status.label}
          </span>
        )}
      </div>
      {children}
      {actions && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </section>
  );
}

/**
 * Gmail connection management in Settings: account, status, last sync, and Connect / Reconnect / Disconnect /
 * Finish disconnecting, plus sync problems with Retry sync. Day-to-day syncing and reviews live on Applications.
 */
export function GmailSettingsCard() {
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

  // When a background sync finishes, refresh applications and the review list once.
  useEffect(() => {
    if (wasRunning.current && !running) {
      void qc.invalidateQueries({ queryKey: qk.apps });
      void qc.invalidateQueries({ queryKey: qk.gmailReviews });
    }
    wasRunning.current = running;
  }, [running, qc]);

  if (gmail.isLoading) {
    return (
      <Shell busy>
        <p className="flex items-center gap-2 text-sm text-soft">
          <Spinner className="size-3.5" />
          Loading Gmail…
        </p>
      </Shell>
    );
  }
  if (gmail.isError || !gmail.data) {
    return (
      <Shell
        actions={
          <Button size="sm" variant="secondary" loading={gmail.isFetching} onClick={() => void gmail.refetch()}>
            Retry
          </Button>
        }
      >
        <p role="alert" className="text-sm text-danger">
          Could not load Gmail status.
        </p>
      </Shell>
    );
  }

  const g = gmail.data;
  const state = g.connection.state;
  if (state === 'not_connected' && !g.available) {
    return (
      <Shell status={{ label: 'Unavailable', tone: 'muted' }}>
        <p className="text-sm leading-relaxed text-soft">Gmail is not available on this server.</p>
      </Shell>
    );
  }

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

  const dialogs = (
    <>
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

  if (state === 'disconnecting') {
    return (
      <Shell
        status={{ label: 'Disconnecting', tone: 'warn' }}
        actions={
          <Button size="sm" variant="secondary" loading={disconnect.isPending} onClick={() => finishDisconnect()}>
            Finish disconnecting
          </Button>
        }
      >
        <p role="status" className="text-sm leading-relaxed text-soft">
          Disconnecting… FlowJob is erasing its Gmail data. If this does not finish, try again; it is safe to repeat.
        </p>
      </Shell>
    );
  }

  if (state === 'not_connected') {
    return (
      <>
        <Shell
          status={{ label: 'Not connected', tone: 'muted' }}
          actions={
            <Button size="sm" onClick={() => setDialog('connect')}>
              Connect Gmail
            </Button>
          }
        >
          <p className="text-sm leading-relaxed text-soft">
            Add applications from confirmation emails and keep track of interviews, offers and replies. You approve
            every status change.
          </p>
        </Shell>
        {dialogs}
      </>
    );
  }

  // Connected (active) or access expired.
  const s = g.sync;
  const pending = g.pendingReviewCount ?? 0;
  const status: { label: string; tone: Tone } =
    state === 'reauth_required'
      ? { label: 'Access expired', tone: 'warn' }
      : running
        ? { label: 'Syncing', tone: 'muted' }
        : { label: 'Connected', tone: 'ok' };

  return (
    <>
      <Shell
        status={status}
        actions={
          <>
            {state === 'reauth_required' && (
              <Button size="sm" onClick={() => setDialog('reconnect')}>
                Reconnect Gmail
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => setConfirmDisconnect(true)}>
              Disconnect Gmail
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-soft">Account</dt>
          <dd className="truncate font-medium">{g.connection.email ?? '—'}</dd>
          <dt className="text-soft">Last sync</dt>
          <dd aria-live="polite">
            {running ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner className="size-3.5" />
                Syncing now{s && s.remaining > 0 ? ` · ${plural(s.remaining, 'email')} to go` : ''}
              </span>
            ) : s?.lastSuccessAt ? (
              fmtRelative(s.lastSuccessAt)
            ) : (
              'Not yet'
            )}
          </dd>
        </dl>

        {state === 'reauth_required' && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            Google access expired. Reconnect with the same account to continue. Your progress and suggestions are
            kept.
          </p>
        )}
        {state === 'active' && s && !running && (s.error || s.failed > 0 || s.remaining > 0) && (
          <div className="flex flex-col gap-1.5 text-sm">
            {s.error && (
              <p role="alert" className="text-danger">
                {s.error.message}
                {s.retryAt && ` Next try ${fmtRelative(s.retryAt)}.`}
              </p>
            )}
            {s.remaining > 0 && <p className="text-soft">{plural(s.remaining, 'email')} left for the next sync.</p>}
            {s.failed > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-danger">{plural(s.failed, 'email')} could not be analysed.</span>
                <Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => runSync(true)}>
                  Retry sync
                </Button>
              </div>
            )}
          </div>
        )}
        {pending > 0 && (
          <Link to="/app/applications" className="self-start text-sm font-medium text-primary hover:underline">
            {plural(pending, 'email')} to review on Applications
          </Link>
        )}
      </Shell>
      {dialogs}
    </>
  );
}
