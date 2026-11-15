import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/client';
import { qk, useDisconnectGmail, useGmail } from '@/shared/api/queries';
import { GmailConnectDialog } from '@/features/applications/gmail/GmailConnectDialog';
import { useGmailOAuth } from '@/features/applications/gmail/useGmailOAuth';
import { cn, fmtRelative } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icons';
import { useToast } from '@/shared/ui/Overlay';
import { Skeleton, Spinner } from '@/shared/ui/Spinner';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Tone = 'plain' | 'accent' | 'warn';

function Strip({
  tone = 'plain',
  icon,
  title,
  text,
  actions,
  live,
}: {
  tone?: Tone;
  icon: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  actions?: ReactNode;
  live?: boolean;
}) {
  return (
    <section
      aria-label="Gmail"
      className={cn(
        'mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border px-4 py-3 animate-in sm:px-5',
        tone === 'plain' && 'border-line bg-surface',
        tone === 'accent' && 'border-accent/50 bg-accent-soft',
        tone === 'warn' && 'border-danger/30 bg-danger-soft',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full',
          tone === 'plain' ? 'bg-tint text-primary' : 'bg-surface text-ink',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 basis-56" aria-live={live ? 'polite' : undefined}>
        <h2 className="text-[15px] leading-snug font-semibold">{title}</h2>
        {text && <div className="mt-0.5 text-sm leading-relaxed text-soft">{text}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}

const Dot = ({ className }: { className: string }) => <span aria-hidden className={cn('size-2.5 rounded-full', className)} />;

/**
 * Gmail at a glance, directly under the Dashboard header. Shows the one state that matters right now
 * (connect, review, syncing, problem, reconnect, disconnecting or all caught up) with the existing action
 * for it. Connecting reuses the Applications panel's consent dialog and OAuth start.
 */
export function DashboardGmail() {
  const toast = useToast();
  const qc = useQueryClient();
  const gmail = useGmail();
  const oauth = useGmailOAuth();
  const disconnect = useDisconnectGmail();
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

  if (gmail.isLoading) return <Skeleton className="mb-5 h-[62px] rounded-2xl" />;
  if (gmail.isError || !gmail.data) {
    return (
      <Strip
        icon={<Icon.mail />}
        title="Gmail"
        text={
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
  const pending = g.pendingReviewCount ?? 0;
  const s = g.sync;
  if (state === 'not_connected' && !g.available) return null; // not configured on this server

  const dialogEl = (
    <GmailConnectDialog
      open={dialog !== null}
      reconnect={dialog === 'reconnect'}
      loading={oauth.isPending}
      onClose={() => setDialog(null)}
      onContinue={() => oauth.begin(dialog ?? 'connect')}
    />
  );
  const reviewAction = pending > 0 && (
    <ButtonLink to="/app/applications" size="sm">
      Review applications
    </ButtonLink>
  );
  const manage = (
    <ButtonLink to="/app/applications" size="sm" variant={pending > 0 ? 'secondary' : 'ghost'}>
      Manage Gmail
    </ButtonLink>
  );
  const reviewTitle = `${plural(pending, 'Gmail update')} to review`;

  if (state === 'not_connected') {
    return (
      <>
        <Strip
          icon={<Icon.mail />}
          title="Connect your Gmail"
          text="Automatically track applications, interviews and hiring updates."
          actions={
            <Button size="sm" onClick={() => setDialog('connect')}>
              Connect Gmail
            </Button>
          }
        />
        {dialogEl}
      </>
    );
  }

  if (state === 'disconnecting') {
    return (
      <Strip
        tone="warn"
        icon={<Icon.mail />}
        title="Gmail is disconnecting"
        text={
          <span role="status">
            FlowJob is erasing its Gmail data. If this does not finish, try again; it is safe to repeat.
          </span>
        }
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={disconnect.isPending}
            onClick={() =>
              disconnect.mutate(undefined, {
                onSuccess: () => toast({ text: 'Gmail disconnected.' }),
                onError: (e) =>
                  toast({
                    text: e instanceof ApiError ? e.message : 'Could not disconnect Gmail. Try again.',
                    tone: 'error',
                  }),
              })
            }
          >
            Finish disconnecting
          </Button>
        }
      />
    );
  }

  if (state === 'reauth_required') {
    return (
      <>
        <Strip
          tone="warn"
          icon={<Icon.mail />}
          title="Gmail access expired"
          text={
            <span role="alert">
              Reconnect with the same Google account to keep tracking. Your progress and suggestions are kept
              {pending > 0 && ` (${plural(pending, 'update')} waiting for review)`}.
            </span>
          }
          actions={
            <>
              <Button size="sm" onClick={() => setDialog('reconnect')}>
                Reconnect Gmail
              </Button>
              {pending > 0 && (
                <ButtonLink to="/app/applications" size="sm" variant="secondary">
                  Review applications
                </ButtonLink>
              )}
            </>
          }
        />
        {dialogEl}
      </>
    );
  }

  // Active connection.
  const email = g.connection.email;
  if (running) {
    return (
      <Strip
        tone={pending > 0 ? 'accent' : 'plain'}
        live
        icon={<Spinner className="size-4" />}
        title={pending > 0 ? reviewTitle : 'Gmail connected · Syncing'}
        text={
          <>
            {s?.phase === 'backfill' ? 'Checking the last 30 days of email…' : 'Checking for new email…'}
            {s && s.remaining > 0 && ` ${plural(s.remaining, 'email')} to go.`}
          </>
        }
        actions={reviewAction}
      />
    );
  }

  const problem = s?.error?.message || (s?.needsAttention ? 'Gmail sync stopped and needs a manual sync.' : '');
  const failed = s?.failed ?? 0;
  if (problem || failed > 0) {
    return (
      <Strip
        tone="warn"
        icon={<Icon.mail />}
        title={pending > 0 ? reviewTitle : 'Gmail sync needs attention'}
        text={
          <span role="alert">
            {[
              problem && `${problem}${s?.retryAt ? ` Next try ${fmtRelative(s.retryAt)}.` : ''}`,
              failed > 0 && `${plural(failed, 'email')} could not be analysed.`,
            ]
              .filter(Boolean)
              .join(' ')}
          </span>
        }
        actions={
          <>
            {reviewAction}
            <ButtonLink to="/app/applications" size="sm" variant="secondary">
              Manage Gmail
            </ButtonLink>
          </>
        }
      />
    );
  }

  if (pending > 0) {
    return (
      <Strip
        tone="accent"
        icon={<Icon.mail />}
        title={reviewTitle}
        text="Gmail found recruitment emails that need a quick decision. Nothing changes without your approval."
        actions={reviewAction}
      />
    );
  }

  const remaining = s?.remaining ?? 0;
  return (
    <Strip
      icon={<Dot className="bg-st-offer" />}
      title={remaining > 0 ? 'Gmail connected' : 'Gmail connected · All caught up'}
      text={
        remaining > 0
          ? `${plural(remaining, 'email')} still to check on the next sync.`
          : [email, s?.lastSuccessAt && `synced ${fmtRelative(s.lastSuccessAt)}`].filter(Boolean).join(' · ') ||
            undefined
      }
      actions={manage}
    />
  );
}
